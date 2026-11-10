#include <cmath>
#include <limits>

#include "closest_pair.h"
#include "trace_out.h"
#include "mergesort.h"

namespace {

struct Pt { double x, y; int32_t id; };

struct Best { double d2; int32_t a, b; };


struct LessX {
    bool operator()(const Pt &p, const Pt &q) const {
        if (p.x != q.x) return p.x < q.x;
        if (p.y != q.y) return p.y < q.y;

        return p.id < q.id;
    }
};

struct LessY {
    bool operator()(const Pt &p, const Pt &q) const {
        if (p.y != q.y) return p.y < q.y;
        if (p.x != q.x) return p.x < q.x;

        return p.id < q.id;
    }
};

inline void consider(Best &best, const Pt &p, const Pt &q) {
    double dx = p.x - q.x, dy = p.y - q.y;
    double d2 = dx * dx + dy * dy;
    if (d2 < best.d2)
        best = {d2, p.id, q.id};
}


inline TracePair tp(const Best &b) { return {b.a, b.b, b.d2}; }


Best solve(Pt *p, Pt *tmp, size_t n, size_t lo, int parentId, int depth, CpTracer *tr) {
    Best best{std::numeric_limits<double>::infinity(), -1, -1};
    const int id = tr ? tr->newId() : 0;
 
    if (n <= 3) {
        for (size_t i = 0; i < n; i++) {
            for (size_t j = i + 1; j < n; j++)
                consider(best, p[i], p[j]);
        }

        if (tr)
            tr->base(id, parentId, depth, static_cast<long long>(lo), static_cast<long long>(lo + n), tp(best));

        for (size_t i = 1; i < n; i++) {
            Pt v = p[i];
            size_t j = i;
            while (j > 0 && LessY()(v, p[j - 1])) { 
                p[j] = p[j - 1]; 
                j--; 
            }

            p[j] = v;
        }

        return best;
    }
 
    size_t mid = n / 2;
    double lineX = p[mid].x;
    if (tr)
        tr->divide(id, parentId, depth, static_cast<long long>(lo), static_cast<long long>(lo + n), static_cast<long long>(lo + mid), lineX);
 
    Best left = solve(p, tmp, mid, lo, id, depth + 1, tr);
    Best right = solve(p + mid, tmp, n - mid, lo + mid, id, depth + 1, tr);
    best = (right.d2 < left.d2) ? right : left;
 
    mergeRuns(p, tmp, mid, n, LessY());
 
    size_t m = 0;
    for (size_t i = 0; i < n; i++) {
        double dx = p[i].x - lineX;
        if (dx * dx < best.d2)
            tmp[m++] = p[i];
    }

    if (tr) {
        std::vector<int> pids(m);
        for (size_t i = 0; i < m; i++)
            pids[i] = tmp[i].id;
        
        tr->strip(id, parentId, depth, lineX, std::sqrt(best.d2), pids, tp(left), tp(right));
    }

    for (size_t i = 0; i < m; i++) {
        for (size_t j = i + 1; j < m; j++) {
            double dy = tmp[j].y - tmp[i].y;
            if (dy * dy >= best.d2)
                break;

            double dx = tmp[i].x - tmp[j].x;
            double d2 = dx * dx + dy * dy;
            bool improved = d2 < best.d2;
            if (improved)
                best = {d2, tmp[i].id, tmp[j].id};

            if (tr) {
                tr->compare(id, parentId, depth, tmp[i].id, tmp[j].id, d2, improved);
                if (improved)
                    tr->update(id, parentId, depth, tp(best));
            }
        }
    }

    if (tr)
        tr->merge(id, parentId, depth, static_cast<long long>(lo), static_cast<long long>(lo + n), tp(best));

    return best;
}
 
}


ClosestPairResult closestPair(const std::vector<double> &xs, const std::vector<double> &ys, CpTracer *tr) {
    size_t n = xs.size();
    std::vector<Pt> pts(n);
    for (size_t i = 0; i < n; i++)
        pts[i] = {xs[i], ys[i], static_cast<int32_t>(i)};
 
    mergeSort(pts, LessX());
    if (tr) {
        std::vector<int> sorted(n);
        for (size_t i = 0; i < n; i++)
            sorted[i] = pts[i].id;

        tr->init(xs, ys, sorted);
    }

    std::vector<Pt> tmp(n);
    Best best = solve(pts.data(), tmp.data(), n, 0, -1, 0, tr);
 
    ClosestPairResult r;
    int32_t a = best.a < best.b ? best.a : best.b;
    int32_t b = best.a < best.b ? best.b : best.a;

    r.a = a;
    r.b = b;
    r.ax = xs[a]; r.ay = ys[a];
    r.bx = xs[b]; r.by = ys[b];
    r.d2 = best.d2;

    return r;
}