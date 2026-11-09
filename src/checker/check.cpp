/*
    check.cpp - correctness checker for the DAA project.

    Library routines (std::sort, std::set, etc) are used here only, but never in the engine/.
    The checks use methods that are different from the engine's algorithms, so a shared bug cannot hide:
    closest pair : sweep line over a sorted set (+ brute force on small inputs)
    multiplication: product checked modulo three big primes (+ exact schoolbook when small)

    check cp  <file> [--expect-distance D]     true closest distance of a point file
    check mul <file> --product <productFile>   verify a product against the two input numbers
    check all [dataDir]                        check all 20 generated files (default: data)
*/

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <numeric>
#include <set>
#include <string>
#include <utility>
#include <vector>

namespace fs = std::filesystem;

static const uint64_t SMALL_LIMIT_BYTES = 1000000;

static bool readFile(const std::string &path, std::string &out) {
    std::ifstream in(path, std::ios::binary);
    if (!in)
        return false;

    std::error_code ec;
    auto sz = fs::file_size(path, ec);
    out.resize(ec ? 0 : static_cast<size_t>(sz));
    if (!out.empty()) in.read(&out[0], static_cast<std::streamsize>(out.size()));

    return true;
}


// Closest Pair
struct Points { int64_t n = 0; std::vector<double> x, y; };

static bool parsePoints(const std::string &data, Points &P, std::string &err) {
    const char *p = data.c_str();
    char *end = nullptr;
    long long n = std::strtoll(p, &end, 10);

    if (end == p || n < 0) { 
        err = "first line is not a valid n"; 
        return false; 
    }

    p = end;
    P.n = n;
    P.x.reserve(static_cast<size_t>(n));
    P.y.reserve(static_cast<size_t>(n));

    for (long long i = 0; i < n; i++) {
        double a = std::strtod(p, &end);
        if (end == p) { 
            err = "line " + std::to_string(i + 2) + ": expected x"; 
            return false; 
        }

        p = end;
        double b = std::strtod(p, &end);
        if (end == p) { 
            err = "line " + std::to_string(i + 2) + ": expected y"; 
            return false; 
        }

        p = end;
        P.x.push_back(a);
        P.y.push_back(b);
    }

    while (*p && std::isspace(static_cast<unsigned char>(*p)))
        ++p;

    if (*p) { 
        err = "extra data after the n points"; 
        return false; 
    }

    return true;
}


struct Best { double d2 = INFINITY; int64_t a = -1, b = -1; };
static Best bruteClosest(const Points &P) {
    Best best;
    for (int64_t i = 0; i < P.n; i++)
        for (int64_t j = i + 1; j < P.n; j++) {
            double dx = P.x[i] - P.x[j], dy = P.y[i] - P.y[j];
            double d2 = dx * dx + dy * dy;
            if (d2 < best.d2)
                best = {d2, i, j};
        }

    return best;
}


static Best sweepClosest(const Points &P) {
    Best best;
    if (P.n < 2)
        return best;

    std::vector<int> ord(static_cast<size_t>(P.n));
    std::iota(ord.begin(), ord.end(), 0);
    std::sort(ord.begin(), ord.end(), [&](int u, int v) { return P.x[u] < P.x[v] || (P.x[u] == P.x[v] && P.y[u] < P.y[v]); });
    std::set<std::pair<double, int>> active;

    size_t left = 0;
    for (size_t i = 0; i < ord.size(); i++) {
        if (best.d2 == 0)
            break;

        int id = ord[i];
        double xi = P.x[id], yi = P.y[id];
        double w = std::sqrt(best.d2) * (1 + 1e-9) + 1e-9;

        while (left < i && xi - P.x[ord[left]] > w) {
            active.erase({P.y[ord[left]], ord[left]});
            left++;

        }

        for (auto it = active.lower_bound({yi - w, -1}); it != active.end() && it->first <= yi + w; it++) {
            int j = it->second;
            double dx = xi - P.x[j], dy = yi - P.y[j];
            double d2 = dx * dx + dy * dy;
            if (d2 < best.d2) 
                best = {d2, std::min<int64_t>(id, j), std::max<int64_t>(id, j)};
        }
        active.insert({yi, id});
    }
    return best;
} 


static int cmdCp(const std::string &path, bool hasExpect, double expect) {
    std::string data, err;
    Points P;

    if (!readFile(path, data)) { 
        std::printf("cannot open %s\n", path.c_str()); 
        return 1; 
    }

    if (!parsePoints(data, P, err)) { 
        std::printf("BAD FILE: %s\n", err.c_str()); 
        return 1; 
    }
    
    Best b = sweepClosest(P);
    if (P.n <= 20000) {
        Best bf = bruteClosest(P);
        if (bf.d2 != b.d2) { 
            std::printf("CHECKER BUG: sweep (%.17g) and brute force (%.17g) disagree\n", b.d2, bf.d2); 
            return 1; 
        }

        std::printf("(sweep line and brute force agree)\n");
    }

    double d = std::sqrt(b.d2);
    std::printf("n = %lld\nclosest distance = %.12g  (squared = %.17g)\npair (0-based indices) = %lld and %lld\n",
                static_cast<long long>(P.n), d, b.d2, static_cast<long long>(b.a), static_cast<long long>(b.b));

    if (hasExpect) {
        bool ok = std::fabs(d - expect) <= 1e-9 * std::max(1.0, d);
        std::printf("expected %.12g -> %s\n", expect, ok ? "PASS" : "FAIL");
        return ok ? 0 : 1;
    }

    return 0;
}
 
// Multiplication
static bool splitLines(const std::string &data, std::vector<std::string> &lines) {
    lines.clear();
    std::string cur;
    for (char c : data) {
        if (c == '\n') { 
            lines.push_back(cur); 
            cur.clear(); 
        }
        else if (c != '\r')
            cur += c;
    }

    if (!cur.empty()) lines.push_back(cur);
    return true;
}


static bool isNumber(const std::string& s) {
    if (s.empty()) return false;
    for (char c : s){
        if (c < '0' || c > '9') 
            return false;
    }

    return !(s.size() > 1 && s[0] == '0');
}


// Four primes just below 2^31, so every product fits in uint64_t.
static const uint64_t PRIMES[4] = {2147483647ULL, 2147483629ULL, 2147483587ULL, 2147483579ULL};

static uint64_t modStr(const std::string &s, uint64_t p) {
    uint64_t r = 0;
    size_t first = s.size() % 9, i = 0;

    auto eat = [&](size_t len) {
        uint64_t chunk = 0, scale = 1;
        for (size_t k = 0; k < len; k++) { chunk = chunk * 10 + static_cast<uint64_t>(s[i + k] - '0'); scale *= 10; }
        r = (r * scale + chunk) % p;
        i += len;
    };

    if (first)
        eat(first);

    while (i < s.size())
        eat(9);

    return r;
}
 
static std::string schoolbook(const std::string &a, const std::string &b) {
    std::vector<uint64_t> acc(a.size() + b.size(), 0);
    for (size_t i = 0; i < a.size(); i++) {
        uint64_t da = static_cast<uint64_t>(a[a.size() - 1 - i] - '0');
        if (!da)
            continue;

        for (size_t j = 0; j < b.size(); j++)
            acc[i + j] += da * static_cast<uint64_t>(b[b.size() - 1 - j] - '0');
    }

    uint64_t carry = 0;
    for (auto& v : acc) {
        v += carry;
        carry = v / 10; v %= 10;
    }

    size_t top = acc.size();
    while (top > 1 && acc[top - 1] == 0)
        top--;

    std::string out(top, '0');
    for (size_t k = 0; k < top; k++)
        out[top - 1 - k] = static_cast<char>('0' + acc[k]);

    return out;
}


struct MulResult { bool ok; std::string msg; };

static MulResult verifyProduct(const std::string &a, const std::string &b, const std::string &c) {
    if (!isNumber(c))
        return {false, "product is not a valid non-negative integer (or has a leading zero)"};

    if (a == "0" || b == "0") {
        if (c == "0") return MulResult{true, "zero case: product is 0"};
        else return MulResult{false, "one operand is 0, product must be 0"};
    }

    size_t lo = a.size() + b.size() - 1, hi = a.size() + b.size();
    if (c.size() != lo && c.size() != hi)
        return {false, "product has " + std::to_string(c.size()) + " digits, expected " + std::to_string(lo) + " or " + std::to_string(hi)};

    if (static_cast<double>(a.size()) * static_cast<double>(b.size()) <= 2.5e7) {
        std::string ex = schoolbook(a, b);
        if (ex == c) return MulResult{true, "exact schoolbook comparison matches (" + std::to_string(c.size()) + " digits)"};          
        else return MulResult{false, "does not match the exact schoolbook product"};
    }

    for (uint64_t p : PRIMES) {
        uint64_t lhs = modStr(a, p) * modStr(b, p) % p;
        if (lhs != modStr(c, p)) return {false, "mismatch modulo " + std::to_string(p)};
    }

    return {true, "matches modulo 4 large primes (" + std::to_string(c.size()) + " digits)"};
}


static int cmdMul(const std::string &path, const std::string &prodPath) {
    std::string data, pdata;
    if (!readFile(path, data)) { 
        std::printf("cannot open %s\n", path.c_str()); 
        return 1; 
    }

    if (!readFile(prodPath, pdata)) { 
        std::printf("cannot open %s\n", prodPath.c_str()); 
        return 1; 
    }

    std::vector<std::string> L, PL;
    splitLines(data, L);
    splitLines(pdata, PL);
    if (L.size() != 2 || !isNumber(L[0]) || !isNumber(L[1])) { 
        std::printf("BAD INPUT FILE: need exactly two valid numbers\n"); 
        return 1; 
    }

    if (PL.empty()) { 
        std::printf("FAIL: product file is empty\n"); 
        return 1; 
    }

    MulResult r = verifyProduct(L[0], L[1], PL[0]);
    std::printf("%s: %s\n", r.ok ? "PASS" : "FAIL", r.msg.c_str());

    return r.ok ? 0 : 1;
} 


// Check All
struct Res { bool ok; std::string msg; };
 
static Res fail(const std::string& m) { return {false, m}; }
 
static Res checkCpFile(const std::string &id, const std::string &data) {
    Points P;
    std::string err;
    if (!parsePoints(data, P, err))
        return fail(err);

    int64_t n = P.n;
    int64_t expectN = id == "cp01" ? 1000 : id == "cp02" ? 10000 : id == "cp03" ? 100000 : id == "cp07" || id == "cp08" ? 100000 : id == "cp10" ? 101 : 1000000;
    if (n != expectN) return fail("n = " + std::to_string(n) + ", expected " + std::to_string(expectN));

    double limit = id == "cp10" ? 1000.0 : id == "cp06" ? 1000.0 : 1000000.0;
    for (int64_t i = 0; i < n; i++){
        if (P.x[i] < 0 || P.y[i] < 0 || P.x[i] > limit || P.y[i] > limit)
            return fail("coordinate outside [0," + std::to_string(static_cast<long long>(limit)) + "]");
    }

    char buf[200];
    if (id == "cp05") {
        std::vector<char> cell(10000, 0);
        for (int64_t i = 0; i < n; i++)
            cell[static_cast<size_t>(std::min(99, int(P.x[i] / 10000.0))) * 100 + static_cast<size_t>(std::min(99, int(P.y[i] / 10000.0)))] = 1;

        int occ = 0;
        for (char c : cell)
            occ += c;

        std::snprintf(buf, sizeof buf, "%d of 10000 map cells occupied (uniform would be ~10000)", occ);
        return {occ < 2500, buf};
    }
    if (id == "cp06") {
        std::vector<char> seen(1001 * 1001, 0);
        int64_t dups = 0;
        for (int64_t i = 0; i < n; i++) {
            if (P.x[i] != std::floor(P.x[i]) || P.y[i] != std::floor(P.y[i]))
                return fail("non-integer coordinate");

            size_t k = static_cast<size_t>(P.x[i]) * 1001 + static_cast<size_t>(P.y[i]);

            if (seen[k]) dups++;
            else seen[k] = 1;
        }
        std::snprintf(buf, sizeof buf, "all integer, %lld duplicate points (closest distance 0)", static_cast<long long>(dups));
        return {dups > 0, buf};
    }
    if (id == "cp07") {
        for (int64_t i = 1; i < n; i++) if (P.x[i] != P.x[0])
            return fail("x values differ: not a vertical line");

        return {true, "all " + std::to_string(n) + " points share the same x"};
    }
    if (id == "cp08") {
        int64_t cols = 1;
        while (cols * cols < n) 
                cols++;
        
        int64_t sp = 1000000 / cols, rows = (n + cols - 1) / cols;
        std::vector<char> grid(static_cast<size_t>(cols * rows), 0);

        for (int64_t i = 0; i < n; i++) {
            double gx = P.x[i] / sp, gy = P.y[i] / sp;
            if (gx != std::floor(gx) || gy != std::floor(gy))
                return fail("point is not on the grid");

            if (gx >= cols || gy >= rows)
                return fail("point outside the grid");

            char& g = grid[static_cast<size_t>(gy) * cols + static_cast<size_t>(gx)];
            if (g)
                return fail("duplicate grid point");

            g = 1;
        }

        int64_t ties = 0;
        for (int64_t r = 0; r < rows; r++) {
            for (int64_t c = 0; c + 1 < cols; c++) {
                if (grid[r * cols + c] && grid[r * cols + c + 1])
                    ties++;
            }
        }

        Best b = sweepClosest(P);
        bool ok = std::sqrt(b.d2) == static_cast<double>(sp) && ties > 1;
        std::snprintf(buf, sizeof buf, "grid spacing %lld, closest distance %.6g, %lld tied neighbour pairs (horizontal)", static_cast<long long>(sp), std::sqrt(b.d2), static_cast<long long>(ties));
        return {ok, buf};
    }
    if (id == "cp09") {
        Best b = sweepClosest(P);
        std::vector<int> ord(static_cast<size_t>(n));
        std::iota(ord.begin(), ord.end(), 0);
        std::sort(ord.begin(), ord.end(), [&](int u, int v) { return P.x[u] < P.x[v] || (P.x[u] == P.x[v] && P.y[u] < P.y[v]); });

        int u = ord[static_cast<size_t>(n / 2 - 1)], v = ord[static_cast<size_t>(n / 2)];
        double dx = P.x[u] - P.x[v], dy = P.y[u] - P.y[v], d2 = dx * dx + dy * dy;
        bool ok = d2 == b.d2 && std::fabs(std::sqrt(b.d2) - 2e-6) < 1e-9;
        std::snprintf(buf, sizeof buf, "closest distance %.9f; middle two points in x-order %s the closest pair", std::sqrt(b.d2), d2 == b.d2 ? "ARE" : "are NOT");
        
        return {ok, buf};
    }

    // cp01-04, cp10: plain uniform points. Cross-check the checker itself when small.
    if (n <= 20000) {
        Best a = sweepClosest(P), bf = bruteClosest(P);
        std::snprintf(buf, sizeof buf, "in range, closest distance %.6g (sweep == brute force: %s)", std::sqrt(a.d2), a.d2 == bf.d2 ? "yes" : "NO");
        return {a.d2 == bf.d2, buf};
    }

    return {true, "n and coordinate range OK"};
}

 
static Res checkImFile(const std::string &id, const std::string &data) {
    std::vector<std::string> L;
    splitLines(data, L);
    if (L.size() != 2)
        return fail("expected exactly 2 lines, found " + std::to_string(L.size()));
    if (!isNumber(L[0]) || !isNumber(L[1]))
        return fail("a line is not a valid number (non-digit or leading zero)");

    size_t la = L[0].size(), lb = L[1].size();
    size_t ea = 1000, eb = 1000;
    if (id == "im01") ea = eb = 1000; 
    else if (id == "im02") ea = eb = 10000; 
    else if (id == "im03") ea = eb = 100000;
    else if (id == "im04") ea = eb = 1000000; 
    else if (id == "im05") { ea = 1000000; eb = 10; }
    else if (id == "im06") ea = eb = 100000; 
    else if (id == "im07") ea = eb = 99999; 
    else if (id == "im08") ea = eb = 1000000;
    else if (id == "im09") { ea = 1; eb = 1000000; } 
    else if (id == "im10") ea = eb = 101;

    if (la != ea || lb != eb)
        return fail("digit counts " + std::to_string(la) + " and " + std::to_string(lb) + ", expected " + std::to_string(ea) + " and " + std::to_string(eb));

    char buf[200];
    std::snprintf(buf, sizeof buf, "%zu and %zu digits", la, lb);
    std::string m = buf;

    if (id == "im06") {
        if (L[0].find_first_not_of('9') != std::string::npos)
            return fail("first number is not all 9s");

        m += ", first number is all 9s";
    }
    else if (id == "im07") {
        if (la % 2 == 0)
            return fail("length is not odd");

        size_t z = static_cast<size_t>(std::count(L[0].begin(), L[0].end(), '0') + std::count(L[1].begin(), L[1].end(), '0'));
        double frac = static_cast<double>(z) / static_cast<double>(la + lb);
        std::snprintf(buf, sizeof buf, ", odd length, %.0f%% zero digits", frac * 100);
        m += buf;

        if (frac < 0.5)
            return fail("not enough zeros");
    }
    else if (id == "im08") {
        for (int k = 0; k < 2; k++)
            if (L[k][0] != '1' || L[k].find_first_not_of('0', 1) != std::string::npos)
                return fail("a number is not a power of 10");

        m += ", both are powers of 10";
    }
    else if (id == "im09") {
        if (L[0] != "0")
            return fail("first number is not 0");

        m += ", first number is 0";
    }
    else if (id == "im05")
        m += " (unbalanced)";

    return {true, m};
}
 
static int cmdAll(const std::string &dataDir) {
    const char *ids[] = {"cp01", "cp02", "cp03", "cp04", "cp05", "cp06", "cp07", "cp08", "cp09", "cp10",
         "im01", "im02", "im03", "im04", "im05", "im06", "im07", "im08", "im09", "im10"};

    int bad = 0;
    for (const char *id : ids) {
        fs::path inSmall = fs::path(dataDir) / "small" / (std::string(id) + ".txt");
        fs::path inLarge = fs::path(dataDir) / "large" / (std::string(id) + ".txt");
        fs::path path = fs::exists(inSmall) ? inSmall : inLarge;

        if (!fs::exists(path)) { 
            std::printf("%-5s FAIL  file not found in %s\n", id, dataDir.c_str()); 
            bad++; 
            continue; 
        }

        std::string data;
        readFile(path.string(), data);
        bool shouldBeSmall = data.size() < SMALL_LIMIT_BYTES;
        bool isSmall = (path == inSmall);
        Res r = (id[0] == 'c') ? checkCpFile(id, data) : checkImFile(id, data);

        if (r.ok && shouldBeSmall != isSmall) 
            r = fail(std::string("file is in the wrong folder (") + (isSmall ? "small" : "large") + ", but its size is " + std::to_string(data.size()) + " bytes)");

        std::printf("%-5s %s  %s\n", id, r.ok ? "PASS" : "FAIL", r.msg.c_str());
        if (!r.ok)
            bad++;
    }

    if (bad == 0) std::printf("\nALL 20 FILES PASS\n");
    else std::printf("\n%d FILE(S) FAILED\n", bad);
    return bad == 0 ? 0 : 1;
}


static void usage() {
    std::puts("usage:\n  check cp  <file> [--expect-distance D]\n  check mul <file> --product <productFile>\n  check all [dataDir]   (default dataDir = data)");
}


int main(int argc, char **argv) {
    if (argc < 2) { 
        usage(); 
        return 1; 
    }

    std::string cmd = argv[1];
    if (cmd == "all")
        return cmdAll(argc >= 3 ? argv[2] : "data");

    if (cmd == "cp" && argc >= 3) {
        bool has = false;
        double e = 0;
        if (argc >= 5 && std::string(argv[3]) == "--expect-distance") { 
            has = true; 
            e = std::strtod(argv[4], nullptr); 
        }

        return cmdCp(argv[2], has, e);
    }

    if (cmd == "mul" && argc >= 5 && std::string(argv[3]) == "--product")
        return cmdMul(argv[2], argv[4]);

    usage();
    return 1;
}