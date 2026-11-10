/*
    main.cpp - command-line front door of the engine.

    engine closest-pair <input-file> [--trace]
    engine karatsuba    <input-file> [--trace] [--out <file>] [--cutoff <limbs>]

    stdout: protocol messages only (hello, result / error). stderr: free-form debug text.
    Exit code 0 = result printed, 1 = error printed.
*/

#include <chrono>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <filesystem>
#include <string>
#include <vector>

#ifdef _WIN32
#include <fcntl.h>
#include <io.h>
#endif

#include "bignum.h"
#include "closest_pair.h"
#include "input.h"
#include "json_out.h"
#include "karatsuba.h"
#include "trace_out.h"

namespace fs = std::filesystem;

static const long long TRACE_MAX_N = 200;
static const size_t TRACE_MAX_DIGITS = 200;
static const size_t TRACE_CUTOFF = 4;
static const size_t DEFAULT_CUTOFF = 128;

static double elapsedMs(std::chrono::steady_clock::time_point t0, std::chrono::steady_clock::time_point t1) {
    return std::chrono::duration<double, std::milli>(t1 - t0).count();
}

static int fail(const char *code, const std::string &msg) {
    emitError(code, msg);
    return 1;
}

static int runClosestPair(const std::string &path, bool trace) {
    std::string data, err;
    if (!readWholeFile(path, data))
        return fail("FILE_NOT_FOUND", "cannot open " + path);

    std::vector<double> xs, ys;
    if (!parsePointFile(data, xs, ys, err))
        return fail("BAD_FORMAT", err);

    data.clear();
    data.shrink_to_fit();
    long long n = static_cast<long long>(xs.size());
    if (n < 2)
        return fail("BAD_FORMAT", "need at least 2 points");

    if (trace && n > TRACE_MAX_N)
        return fail("TRACE_TOO_LARGE", "--trace needs n <= " + std::to_string(TRACE_MAX_N));
 
    CpTracer tracer;
    auto t0 = std::chrono::steady_clock::now();
    ClosestPairResult r = closestPair(xs, ys, trace ? &tracer : nullptr);
    auto t1 = std::chrono::steady_clock::now();
 
    std::printf(
        "{\"type\":\"result\",\"algorithm\":\"closest-pair\",\"file\":\"%s\",\"n\":%lld,\"timeMs\":%.3f,\"traced\":%s,"
        "\"answer\":{\"p1\":[%.17g,%.17g],\"p2\":[%.17g,%.17g],\"p1Index\":%lld,\"p2Index\":%lld,"
        "\"distance\":%.17g,\"distanceSquared\":%.17g}}\n",
        jsonEscape(path).c_str(), n, elapsedMs(t0, t1), trace ? "true" : "false", r.ax, r.ay, r.bx, r.by, static_cast<long long>(r.a),
        static_cast<long long>(r.b), std::sqrt(r.d2), r.d2);

    std::fflush(stdout);
    return 0;
}


static int runKaratsuba(const std::string& path, bool trace, std::string outPath, size_t cutoff, bool cutoffGiven) {
    std::string data, sa, sb, err;
    if (!readWholeFile(path, data)) 
        return fail("FILE_NOT_FOUND", "cannot open " + path);

    if (!parseTwoNumbers(data, sa, sb, err)) 
        return fail("BAD_FORMAT", err);

    data.clear();
    data.shrink_to_fit();

    if (trace && (sa.size() > TRACE_MAX_DIGITS || sb.size() > TRACE_MAX_DIGITS))
        return fail("TRACE_TOO_LARGE", "--trace needs both numbers to have <= " + std::to_string(TRACE_MAX_DIGITS) + " digits");

    if (trace && !cutoffGiven)
        cutoff = TRACE_CUTOFF;

    if (cutoff < 4)
        cutoff = 4; 
 
    if (outPath.empty()) {
        std::string stem = fs::path(path).stem().string();
        outPath = (fs::path("out") / (stem + ".product.txt")).string();
    }
 
    big::Limbs a = big::parseDecimal(sa);
    big::Limbs b = big::parseDecimal(sb);
 
    KaraTracer tracer;
    if (trace)
        tracer.init(sa, sb, cutoff);

    auto t0 = std::chrono::steady_clock::now();
    big::Limbs prod = karatsubaMultiply(a, b, cutoff, trace ? &tracer : nullptr);
    auto t1 = std::chrono::steady_clock::now();
 
    std::string p = big::toDecimal(prod);
 
    fs::path op(outPath);
    std::error_code ec;
    if (op.has_parent_path())
        fs::create_directories(op.parent_path(), ec);

    FILE* f = std::fopen(outPath.c_str(), "wb");
    if (!f)
        return fail("INTERNAL", "cannot write " + outPath);

    std::fwrite(p.data(), 1, p.size(), f);
    std::fputc('\n', f);
    std::fclose(f);
 
    size_t keep = p.size() < 50 ? p.size() : 50;
    std::string head = p.substr(0, keep), tail = p.substr(p.size() - keep);
    std::string full = p.size() <= 1000 ? "\"" + p + "\"" : "null";
 
    std::printf(
        "{\"type\":\"result\",\"algorithm\":\"karatsuba\",\"file\":\"%s\",\"timeMs\":%.3f,\"traced\":%s,"
        "\"answer\":{\"digitsA\":%llu,\"digitsB\":%llu,\"productDigits\":%llu,\"productHead\":\"%s\","
        "\"productTail\":\"%s\",\"outputFile\":\"%s\",\"product\":%s}}\n",
        jsonEscape(path).c_str(), elapsedMs(t0, t1), trace ? "true" : "false", static_cast<unsigned long long>(sa.size()),
        static_cast<unsigned long long>(sb.size()), static_cast<unsigned long long>(p.size()), head.c_str(), tail.c_str(),
        jsonEscape(outPath).c_str(), full.c_str());

    std::fflush(stdout);
    return 0;
}

int main(int argc, char **argv) {
#ifdef _WIN32
    _setmode(_fileno(stdout), _O_BINARY);
#endif
    emitHello();
 
    std::vector<std::string> pos;
    bool trace = false;
    std::string out;
    size_t cutoff = DEFAULT_CUTOFF;
    bool cutoffGiven = false;
    for (int i = 1; i < argc; i++) {
        std::string a = argv[i];

        if (a == "--trace") trace = true;
        else if (a == "--out" && i + 1 < argc) out = argv[++i];
        else if (a == "--cutoff" && i + 1 < argc) { 
            cutoff = static_cast<size_t>(std::strtoull(argv[++i], nullptr, 10)); 
            cutoffGiven = true; 
        }
        else if (a.size() >= 2 && a[0] == '-' && a[1] == '-') return fail("BAD_ARGS", "unknown or incomplete option " + a);
        else pos.push_back(a);
    }

    if (pos.size() != 2)
        return fail("BAD_ARGS", "usage: engine <closest-pair|karatsuba> <input-file> [--trace] [--out file] [--cutoff limbs]");

    if (pos[0] == "closest-pair") {
        if (!out.empty())
            return fail("BAD_ARGS", "--out is only for karatsuba");
        
        return runClosestPair(pos[1], trace);
    }

    if (pos[0] == "karatsuba")
        return runKaratsuba(pos[1], trace, out, cutoff, cutoffGiven);

    return fail("BAD_ARGS", "unknown algorithm '" + pos[0] + "' (use closest-pair or karatsuba)");
}