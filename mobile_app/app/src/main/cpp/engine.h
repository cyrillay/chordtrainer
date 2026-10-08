// The audio engine: one low-latency Oboe output stream, a queue of notes
// scheduled by absolute frame, and the synth. The game thread schedules a
// bar or so ahead; the audio callback starts each note on its exact frame.

#pragma once
#include <oboe/Oboe.h>
#include <atomic>
#include <memory>
#include <mutex>
#include "synth.h"

struct Event {
    int64_t frame;
    int32_t patch, midi;
    float vel;
    int64_t durFrames;
};

class Engine : public oboe::AudioStreamDataCallback, public oboe::AudioStreamErrorCallback {
public:
    bool start();
    void stop();
    // Thread-safe: called from the game thread.
    bool schedule(const Event &e);
    void clear();
    int64_t framesRendered() const { return frames_.load(std::memory_order_acquire); }
    int32_t sampleRate() const { return sampleRate_; }
    // Frame at the speaker and its CLOCK_MONOTONIC time in ns.
    bool timestamp(int64_t *frame, int64_t *nanos);
    // Frames between the callback and the speaker, as a fallback.
    int64_t latencyFrames();

    oboe::DataCallbackResult onAudioReady(oboe::AudioStream *s, void *data, int32_t frames) override;
    void onErrorAfterClose(oboe::AudioStream *s, oboe::Result error) override;

private:
    static constexpr int kQueue = 4096;   // ring of incoming events
    static constexpr int kPending = 2048; // events waiting for their frame
    Event ring_[kQueue];
    std::atomic<int> head_{0}, tail_{0};
    std::atomic<bool> clear_{false};
    Event pending_[kPending];
    int pendingCount_ = 0;

    std::shared_ptr<oboe::AudioStream> stream_;
    std::mutex lock_;
    std::atomic<int64_t> frames_{0};
    int32_t sampleRate_ = 48000;
    int32_t channels_ = 2;
    Synth synth_;
    float mono_[4096];
    bool openStream();
};
