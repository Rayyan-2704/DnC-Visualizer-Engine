/*
    trace_out.h - writes the "step" messages used by --trace (docs/protocol.md sections 3.4, 4, 5).
    One JSON object per line on stdout, flushed after every line so the UI can show events live.
*/

#pragma once
#include <cstdint>
#include <string>
#include <vector>

class StepEmitter {
protected:
    void head(int id, int parentId, int depth, const char *kind);
    void tail(const std::string &msg);
    long long seq_ = 0;
};

struct TracePair {
    int a, b;
    double d2;
};

// Closest Pair
class CpTracer : private StepEmitter {
    int nextId_ = 0;

public:
    int newId() { return nextId_++; }

    void init(const std::vector<double> &xs, const std::vector<double> &ys, const std::vector<int> &sortedByX);
    void divide(int id, int parentId, int depth, long long lo, long long hi, long long mid, double lineX);
    void base(int id, int parentId, int depth, long long lo, long long hi, const TracePair &best);
    void strip(int id, int parentId, int depth, double lineX, double delta, const std::vector<int> &pids, const TracePair &bestLeft, const TracePair &bestRight);
    void compare(int id, int parentId, int depth, int a, int b, double d2, bool improved);
    void update(int id, int parentId, int depth, const TracePair &best);
    void merge(int id, int parentId, int depth, long long lo, long long hi, const TracePair &best);
};

// Karatsuba
class KaraTracer : private StepEmitter {
    int nextId_ = 0;

public:
    int newId() { return nextId_++; }
    void init(const std::string &a, const std::string &b, size_t cutoffLimbs);
    void split(int id, int parentId, int depth, const char *role, const std::string &x, const std::string &y,
               long long m, const std::string &x1, const std::string &x0, const std::string &y1, const std::string &y0, bool unbalanced);
    void base(int id, int parentId, int depth, const char *role, const std::string &x, const std::string &y, const std::string &product);
    void combine(int id, int parentId, int depth, const std::string &z0, const std::string &z1, const std::string &z2, const std::string &mid, const std::string &product);
    void combinePieces(int id, int parentId, int depth, const std::vector<std::string> &pieces, const std::string &product);
};