/* 
    This is a custom random number generator helper file
    rng.h --> seeded random numbers for the DAA generator.
    std::uniform_int_distribution (uniform_real_distribution) gives different results on different compilers.
    The marker (Miss Anaum/TA) regenerates our files, so "same seed --> same file" must hold everywhere.
    std::mt19937_64 itself is fully specified by the C++ standard (same stream of 64-bit numbers everywhere),
    so we use it for raw bits and do the "bits -> number in a range" step ourselves below.
*/

#pragma once
#include <cstdint>
#include <random>
#include <utility>
#include <vector>

class Rng {
    std::mt19937_64 eng_;

public:
    explicit Rng(uint64_t seed) : eng_(seed) {}

    // Raw 64 random bits
    uint64_t next() { 
        return eng_(); 
    }

    // Uniform integer in [0, bound). Upper limit excluded. Rejection sampling, so there is no modulo bias.
    uint64_t below(uint64_t bound) {
        if (bound <= 1) return 0;

        const uint64_t t = (0 - bound) % bound;  // 2^64 mod bound
        uint64_t r;
        do {
            r = eng_();
        } while(r < t);

        return r % bound;
    }

    // Uniform integer in [lo, hi], both inclusive.
    int64_t range(int64_t lo, int64_t hi) {
        return lo + static_cast<int64_t>(below(static_cast<uint64_t>(hi - lo) + 1));
    }
};


// Fisher-Yates shuffle driven by our own Rng (as std::shuffle is compiler-dependent).
// Time Complexity: O(n), Extra-Space Complexity: O(1)
template <class T>
void shuffleVec(Rng &rng, std::vector<T> &v) {
    for (size_t i = v.size(); i > 1; i--) {
        size_t j = static_cast<size_t>(rng.below(i));
        std::swap(v[i - 1], v[j]);
    }
}