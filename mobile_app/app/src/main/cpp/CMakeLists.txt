cmake_minimum_required(VERSION 3.22.1)
project(ghostband LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
find_package(oboe REQUIRED CONFIG)

add_library(ghostband SHARED engine.cpp synth.cpp jni.cpp)
target_compile_options(ghostband PRIVATE -Wall -O2 -ffast-math)
target_link_libraries(ghostband oboe::oboe log)
