#include "engine.h"
#include <android/log.h>
#include <cmath>
#include <cstring>

#define LOG(...) __android_log_print(ANDROID_LOG_INFO, "GhostBand", __VA_ARGS__)

bool Engine::openStream() {
    oboe::AudioStreamBuilder b;
    b.setDirection(oboe::Direction::Output)
        ->setPerformanceMode(oboe::PerformanceMode::LowLatency)
        ->setSharingMode(oboe::SharingMode::Exclusive)
        ->setFormat(oboe::AudioFormat::Float)
        ->setChannelCount(oboe::ChannelCount::Stereo)
        ->setUsage(oboe::Usage::Game)
        ->setDataCallback(this)
        ->setErrorCallback(this);
    oboe::Result r = b.openStream(stream_);
    if (r != oboe::Result::OK) { LOG("open failed: %s", oboe::convertToText(r)); return false; }
    sampleRate_ = stream_->getSampleRate();
    channels_ = stream_->getChannelCount();
    synth_.setSampleRate(static_cast<float>(sampleRate_));
    // Two bursts: the usual low-latency sweet spot.
    stream_->setBufferSizeInFrames(stream_->getFramesPerBurst() * 2);
    return stream_->requestStart() == oboe::Result::OK;
}

bool Engine::start() {
    std::lock_guard<std::mutex> g(lock_);
    if (stream_) return true;
    return openStream();
}

void Engine::stop() {
    std::lock_guard<std::mutex> g(lock_);
    if (stream_) { stream_->stop(); stream_->close(); stream_.reset(); }
}

bool Engine::schedule(const Event &e) {
    int h = head_.load(std::memory_order_relaxed);
    int next = (h + 1) % kQueue;
    if (next == tail_.load(std::memory_order_acquire)) return false;  // full
    ring_[h] = e;
    head_.store(next, std::memory_order_release);
    return true;
}

void Engine::clear() { clear_.store(true, std::memory_order_release); }

bool Engine::timestamp(int64_t *frame, int64_t *nanos) {
    std::lock_guard<std::mutex> g(lock_);
    if (!stream_) return false;
    auto r = stream_->getTimestamp(CLOCK_MONOTONIC);
    if (!r) return false;
    *frame = r.value().position;
    *nanos = r.value().timestamp;
    return true;
}

int64_t Engine::latencyFrames() {
    std::lock_guard<std::mutex> g(lock_);
    if (!stream_) return 0;
    auto l = stream_->calculateLatencyMillis();
    if (l) return static_cast<int64_t>(l.value() * sampleRate_ / 1000.0);
    return stream_->getBufferSizeInFrames();
}

oboe::DataCallbackResult Engine::onAudioReady(oboe::AudioStream *, void *data, int32_t frames) {
    const int64_t start = frames_.load(std::memory_order_relaxed);
    const int64_t end = start + frames;

    if (clear_.exchange(false, std::memory_order_acq_rel)) {
        pendingCount_ = 0;
        tail_.store(head_.load(std::memory_order_acquire), std::memory_order_release);
        synth_.allOff();
    }
    // Drain the ring into the pending list.
    int t = tail_.load(std::memory_order_relaxed);
    const int h = head_.load(std::memory_order_acquire);
    while (t != h && pendingCount_ < kPending) {
        pending_[pendingCount_++] = ring_[t];
        t = (t + 1) % kQueue;
    }
    tail_.store(t, std::memory_order_release);

    // Start what falls in this block; late events start right away.
    for (int i = 0; i < pendingCount_;) {
        const Event &e = pending_[i];
        if (e.frame < end) {
            synth_.noteOn(e.patch, e.midi, e.vel, e.durFrames, e.frame - start);
            pending_[i] = pending_[--pendingCount_];
        } else {
            i++;
        }
    }

    float *out = static_cast<float *>(data);
    int done = 0;
    while (done < frames) {
        int n = std::min(frames - done, 4096);
        std::memset(mono_, 0, sizeof(float) * n);
        synth_.render(mono_, n);
        for (int i = 0; i < n; i++) {
            float s = std::tanh(mono_[i] * 0.35f);  // headroom for a full band, soft clip on top
            for (int c = 0; c < channels_; c++) out[(done + i) * channels_ + c] = s;
        }
        done += n;
    }
    frames_.store(end, std::memory_order_release);
    return oboe::DataCallbackResult::Continue;
}

// Headphones unplugged, Bluetooth switched: reopen on the new device.
void Engine::onErrorAfterClose(oboe::AudioStream *, oboe::Result error) {
    LOG("stream closed: %s, reopening", oboe::convertToText(error));
    std::lock_guard<std::mutex> g(lock_);
    stream_.reset();
    openStream();
}
