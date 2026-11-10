#include "trace_out.h"

#include <cmath>
#include <cstdarg>
#include <cstdio>

#include "json_out.h"

namespace {
std::string num(double v) {
    char b[40];
    std::snprintf(b, sizeof b, "%.17g", std::isfinite(v) ? v : 0.0);
    return b;
}


std::string str(const std::string &s) { return "\"" + jsonEscape(s) + "\""; }


std::string fmt(const char* f, ...) {
    char b[400];
    va_list ap;
    va_start(ap, f);
    std::vsnprintf(b, sizeof b, f, ap);
    va_end(ap);
    return b;
}
std::string pairJson(const TracePair &p) {
    int lo = p.a < p.b ? p.a : p.b, hi = p.a < p.b ? p.b : p.a;
    return "{\"a\":" + std::to_string(lo) + ",\"b\":" + std::to_string(hi) + ",\"d2\":" + num(p.d2) + "}";
}
}


void StepEmitter::head(int id, int parentId, int depth, const char *kind) {
    std::printf("{\"type\":\"step\",\"seq\":%lld,\"id\":%d,\"parentId\":", seq_++, id);
    if (parentId < 0) 
        std::printf("null");
    else 
        std::printf("%d", parentId);

    std::printf(",\"depth\":%d,\"kind\":\"%s\"", depth, kind);
}


void StepEmitter::tail(const std::string &msg) {
    std::printf(",\"msg\":\"%s\"}\n", jsonEscape(msg).c_str());
    std::fflush(stdout);
}


void CpTracer::init(const std::vector<double> &xs, const std::vector<double> &ys, const std::vector<int> &sortedByX) {
    head(0, -1, 0, "init");
    std::printf(",\"points\":[");
    for (size_t i = 0; i < xs.size(); i++) 
        std::printf("%s[%s,%s]", i ? "," : "", num(xs[i]).c_str(), num(ys[i]).c_str());

    std::printf("],\"sortedByX\":[");
    for (size_t i = 0; i < sortedByX.size(); i++) 
        std::printf("%s%d", i ? "," : "", sortedByX[i]);

    std::printf("]");
    tail(fmt("Loaded %llu points and sorted them by x", static_cast<unsigned long long>(xs.size())));
}


void CpTracer::divide(int id, int parentId, int depth, long long lo, long long hi, long long mid, double lineX) {
    head(id, parentId, depth, "divide");
    std::printf(",\"lo\":%lld,\"hi\":%lld,\"mid\":%lld,\"lineX\":%s", lo, hi, mid, num(lineX).c_str());
    tail(fmt("Split positions %lld-%lld into %lld-%lld and %lld-%lld at x = %.6g", lo, hi - 1, lo, mid - 1, mid, hi - 1, lineX));
}


void CpTracer::base(int id, int parentId, int depth, long long lo, long long hi, const TracePair &best) {
    head(id, parentId, depth, "base");
    std::printf(",\"lo\":%lld,\"hi\":%lld,\"best\":%s", lo, hi, pairJson(best).c_str());
    tail(fmt("%lld points: checked every pair; closest is %d and %d (d^2 = %.6g)", hi - lo, best.a < best.b ? best.a : best.b,
             best.a < best.b ? best.b : best.a, best.d2));
}


void CpTracer::strip(int id, int parentId, int depth, double lineX, double delta, const std::vector<int> &pids,
                     const TracePair &bestLeft, const TracePair &bestRight) {
    head(id, parentId, depth, "strip");
    std::printf(",\"lineX\":%s,\"delta\":%s,\"stripPids\":[", num(lineX).c_str(), num(delta).c_str());
    for (size_t i = 0; i < pids.size(); i++)
        std::printf("%s%d", i ? "," : "", pids[i]);

    std::printf("],\"bestLeft\":%s,\"bestRight\":%s", pairJson(bestLeft).c_str(), pairJson(bestRight).c_str());
    tail(fmt("Strip around x = %.6g, width +-%.6g: %llu points to check across the line", lineX, delta, static_cast<unsigned long long>(pids.size())));
}


void CpTracer::compare(int id, int parentId, int depth, int a, int b, double d2, bool improved) {
    head(id, parentId, depth, "compare");
    std::printf(",\"a\":%d,\"b\":%d,\"d2\":%s,\"improved\":%s", a, b, num(d2).c_str(), improved ? "true" : "false");
    tail(fmt("Compared points %d and %d: d^2 = %.6g%s", a, b, d2, improved ? ", a new best" : ", no improvement"));
}


void CpTracer::update(int id, int parentId, int depth, const TracePair &best) {
    head(id, parentId, depth, "update");
    std::printf(",\"best\":%s", pairJson(best).c_str());
    tail(fmt("New best pair: %d and %d (d^2 = %.6g)", best.a < best.b ? best.a : best.b, best.a < best.b ? best.b : best.a, best.d2));
}


void CpTracer::merge(int id, int parentId, int depth, long long lo, long long hi, const TracePair &best) {
    head(id, parentId, depth, "merge");
    std::printf(",\"lo\":%lld,\"hi\":%lld,\"best\":%s", lo, hi, pairJson(best).c_str());
    tail(fmt("Positions %lld-%lld solved: closest pair is %d and %d (d^2 = %.6g)", lo, hi - 1, best.a < best.b ? best.a : best.b,
             best.a < best.b ? best.b : best.a, best.d2));
}


void KaraTracer::init(const std::string &a, const std::string &b, size_t cutoffLimbs) {
    head(0, -1, 0, "init");
    std::printf(",\"a\":%s,\"b\":%s,\"limbBase\":1000000000,\"cutoffLimbs\":%llu", str(a).c_str(), str(b).c_str(), static_cast<unsigned long long>(cutoffLimbs));
    tail(fmt("Multiplying a %llu-digit number by a %llu-digit number. Numbers are cut into 9-digit limbs; below %llu limbs we multiply the school way",
             static_cast<unsigned long long>(a.size()), static_cast<unsigned long long>(b.size()), static_cast<unsigned long long>(cutoffLimbs)));
}


void KaraTracer::split(int id, int parentId, int depth, const char *role, const std::string &x, const std::string &y,
                       long long m, const std::string &x1, const std::string &x0, const std::string &y1, const std::string &y0, bool unbalanced) {
    head(id, parentId, depth, "split");
    std::printf(",\"role\":");
    if (role) std::printf("\"%s\"", role); else std::printf("null");
    std::printf(",\"x\":%s,\"y\":%s,\"m\":%lld,\"mDigits\":%lld,\"x1\":%s,\"x0\":%s,\"y1\":%s,\"y0\":%s,\"unbalanced\":%s",
                str(x).c_str(), str(y).c_str(), m, m * 9, str(x1).c_str(), str(x0).c_str(), str(y1).c_str(), str(y0).c_str(),
                unbalanced ? "true" : "false");

    if (unbalanced)
        tail(fmt("y is much shorter than x, so no padding: cut x after %lld digits and multiply each piece by y", m * 9));
    else
        tail(fmt("Cut both numbers after %lld digits: x = x1*10^%lld + x0, y = y1*10^%lld + y0. Three products (z0, z1, z2) instead of four", m * 9, m * 9, m * 9));
}


void KaraTracer::base(int id, int parentId, int depth, const char *role, const std::string &x, const std::string &y, const std::string &product) {
    head(id, parentId, depth, "base");
    std::printf(",\"role\":");
    if (role)
        std::printf("\"%s\"", role); else std::printf("null");

    std::printf(",\"x\":%s,\"y\":%s,\"product\":%s", str(x).c_str(), str(y).c_str(), str(product).c_str());
    tail(fmt("%s%sSmall enough: multiplied the school way", role ? role : "", role ? ": " : ""));
}


void KaraTracer::combine(int id, int parentId, int depth, const std::string &z0, const std::string &z1,
                        const std::string &z2, const std::string &mid, const std::string &product) {
    head(id, parentId, depth, "combine");
    std::printf(",\"unbalanced\":false,\"z0\":%s,\"z1\":%s,\"z2\":%s,\"mid\":%s,\"product\":%s", str(z0).c_str(), str(z1).c_str(),
                str(z2).c_str(), str(mid).c_str(), str(product).c_str());
    tail("Combine: z2 * 10^(2m) + (z1 - z2 - z0) * 10^m + z0");
}


void KaraTracer::combinePieces(int id, int parentId, int depth, const std::vector<std::string> &pieces, const std::string &product) {
    head(id, parentId, depth, "combine");
    std::printf(",\"unbalanced\":true,\"pieces\":[");
    for (size_t i = 0; i < pieces.size(); i++) 
        std::printf("%s%s", i ? "," : "", str(pieces[i]).c_str());

    std::printf("],\"product\":%s", str(product).c_str());
    tail("Combine: piece1 * 10^m + piece0");
}