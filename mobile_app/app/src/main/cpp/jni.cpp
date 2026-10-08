// JNI bridge for io.chordtrainer.ghostjam.audio.AudioEngine.
#include <jni.h>
#include "engine.h"

static Engine engine;

#define FN(name) Java_io_chordtrainer_ghostjam_audio_AudioEngine_##name

extern "C" {

JNIEXPORT jboolean JNICALL FN(nativeStart)(JNIEnv *, jobject) { return engine.start(); }
JNIEXPORT void JNICALL FN(nativeStop)(JNIEnv *, jobject) { engine.stop(); }
JNIEXPORT void JNICALL FN(nativeClear)(JNIEnv *, jobject) { engine.clear(); }
JNIEXPORT jint JNICALL FN(nativeSampleRate)(JNIEnv *, jobject) { return engine.sampleRate(); }
JNIEXPORT jlong JNICALL FN(nativeFramesRendered)(JNIEnv *, jobject) { return engine.framesRendered(); }
JNIEXPORT jlong JNICALL FN(nativeLatencyFrames)(JNIEnv *, jobject) { return engine.latencyFrames(); }

JNIEXPORT jboolean JNICALL FN(nativeSchedule)(JNIEnv *, jobject, jlong frame, jint patch, jint midi, jfloat vel, jlong dur) {
    return engine.schedule(Event{frame, patch, midi, vel, dur});
}

// out[0] = frame at the speaker, out[1] = its System.nanoTime().
JNIEXPORT jboolean JNICALL FN(nativeTimestamp)(JNIEnv *env, jobject, jlongArray out) {
    int64_t frame, nanos;
    if (!engine.timestamp(&frame, &nanos)) return false;
    jlong v[2] = {frame, nanos};
    env->SetLongArrayRegion(out, 0, 2, v);
    return true;
}

}
