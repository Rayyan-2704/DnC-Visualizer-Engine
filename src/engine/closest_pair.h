/*
    closest_pair.h - O(n*log(n)) divide and conquer closest pair of points.
*/

#pragma once
#include <cstdint>
#include <vector>

struct ClosestPairResult {
    int64_t a = -1, b = -1;
    double ax = 0, ay = 0, bx = 0, by = 0;
    double d2 = 0;
};

class CpTracer;

ClosestPairResult closestPair(const std::vector<double> &xs, const std::vector<double> &ys, CpTracer *tracer = nullptr);;