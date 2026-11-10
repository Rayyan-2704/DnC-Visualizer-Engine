/*
    bignum.h - tiny big-number toolkit: non-negative integers as arrays of base-10^9.
    no built-in big-integer routines are allowed in the algorithms.
*/
#pragma once
#include <cstddef>
#include <cstdint>
#include <cstdio>
#include <string>
#include <vector>

namespace big {

using Limbs = std::vector<uint32_t>;
static const uint32_t BASE = 1000000000u;

inline void trim(Limbs &v) { 
    while (!v.empty() && v.back() == 0) 
        v.pop_back(); 
}

inline size_t trimLen(const uint32_t *p, size_t n) { 
    while (n > 0 && p[n - 1] == 0) 
        n--;

    return n; 
}


inline Limbs parseDecimal(const std::string &s) {
    Limbs v;
    v.reserve(s.size() / 9 + 1);
    size_t end = s.size();
    while (end > 0) {
        size_t beg = end >= 9 ? end - 9 : 0;
        uint32_t limb = 0;
        for (size_t i = beg; i < end; i++) 
            limb = limb * 10 + static_cast<uint32_t>(s[i] - '0');

        v.push_back(limb);
        end = beg;
    }
    trim(v);
    return v;
}


inline std::string toDecimal(const Limbs &v) {
    if (v.empty())
        return "0";

    std::string s;
    s.reserve(v.size() * 9);
    char buf[16];
    std::snprintf(buf, sizeof buf, "%u", v.back());
    s += buf;
    for (size_t i = v.size() - 1; i-- > 0;) {
        std::snprintf(buf, sizeof buf, "%09u", v[i]);
        s += buf;
    }

    return s;
}


inline Limbs add(const uint32_t *a, size_t la, const uint32_t *b, size_t lb) {
    if (la < lb) { 
        std::swap(a, b); 
        std::swap(la, lb); 
    }

    Limbs r(la + 1);
    uint32_t carry = 0;
    for (size_t i = 0; i < la; i++) {
        uint32_t s = a[i] + (i < lb ? b[i] : 0) + carry;

        if (s >= BASE) { 
            s -= BASE; 
            carry = 1; 
        } 
        else 
            carry = 0;

        r[i] = s;
    }

    r[la] = carry;
    trim(r);
    return r;
}


inline Limbs sub(const Limbs &a, const Limbs &b) {
    Limbs r(a);
    int64_t borrow = 0;
    for (size_t i = 0; i < r.size(); i++) {
        int64_t d = static_cast<int64_t>(r[i]) - borrow - (i < b.size() ? static_cast<int64_t>(b[i]) : 0);
        if (d < 0) { 
            d += BASE; 
            borrow = 1; 
        }
        else
            borrow = 0;

        r[i] = static_cast<uint32_t>(d);
    }

    trim(r);
    return r;
}


inline void addShifted(Limbs &acc, const Limbs &x, size_t shift) {
    if (x.empty())
        return;

    if (acc.size() < shift + x.size() + 1)
        acc.resize(shift + x.size() + 1, 0);

    uint32_t carry = 0;
    size_t i = 0;
    for (; i < x.size(); i++) {
        uint32_t s = acc[shift + i] + x[i] + carry;
        if (s >= BASE) { 
            s -= BASE; 
            carry = 1; 
        } 
        else
            carry = 0;

        acc[shift + i] = s;
    }

    for (size_t k = shift + i; carry; k++) {
        if (k >= acc.size()) acc.push_back(0);
        uint32_t s = acc[k] + carry;
        if (s >= BASE) { 
            s -= BASE; 
            carry = 1; 
        } 
        else 
            carry = 0;

        acc[k] = s;
    }

    trim(acc);
}


inline void normalize(uint64_t *acc, size_t n) {
    uint64_t carry = 0;
    for (size_t k = 0; k < n; k++) {
        uint64_t v = acc[k] + carry;
        acc[k] = v % BASE;
        carry = v / BASE;
    }
}


inline Limbs mulSchool(const uint32_t *a, size_t la, const uint32_t *b, size_t lb) {
    la = trimLen(a, la);
    lb = trimLen(b, lb);
    if (la == 0 || lb == 0)
        return Limbs();

    if (la > lb) { 
        std::swap(a, b); 
        std::swap(la, lb); 
    }
    
    std::vector<uint64_t> acc(la + lb, 0);
    int rows = 0;
    for (size_t i = 0; i < la; i++) {
        uint64_t ai = a[i];
        if (ai) {
            uint64_t* row = acc.data() + i;
            for (size_t j = 0; j < lb; j++)
                row[j] += ai * b[j];
        }

        if (++rows == 16) { 
            normalize(acc.data(), acc.size()); 
            rows = 0; 
        }
    }

    normalize(acc.data(), acc.size());
    Limbs r(acc.size());
    for (size_t k = 0; k < acc.size(); k++) 
        r[k] = static_cast<uint32_t>(acc[k]);

    trim(r);
    return r;
}

}