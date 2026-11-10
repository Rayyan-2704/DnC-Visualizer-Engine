#include "karatsuba.h"
#include "trace_out.h"

#include <utility>

using namespace big;

namespace {
 
struct Ctx {
    size_t cutoff;
    KaraTracer *tr;
};
 
std::string dec(const uint32_t *p, size_t n) {
    n = trimLen(p, n);
    return toDecimal(Limbs(p, p + n));
}


Limbs mul(const uint32_t *a, size_t la, const uint32_t *b, size_t lb, const Ctx &c, int parentId, int depth, const char *role) {
    la = trimLen(a, la);
    lb = trimLen(b, lb);
    const int id = c.tr ? c.tr->newId() : 0;
    if (la < lb) { 
        std::swap(a, b); 
        std::swap(la, lb); 
    }


    if (lb == 0) {
        if (c.tr) 
            c.tr->base(id, parentId, depth, role, dec(a, la), "0", "0");
        
        return Limbs();
    }
 
    if (lb < c.cutoff) {
        Limbs r = mulSchool(a, la, b, lb);
        if (c.tr)
            c.tr->base(id, parentId, depth, role, dec(a, la), dec(b, lb), toDecimal(r));
        
        return r;
    }
 
    size_t m = (la + 1) / 2;
 
    if (lb <= m) {
        if (c.tr)
            c.tr->split(id, parentId, depth, role, dec(a, la), dec(b, lb), static_cast<long long>(m), dec(a + m, la - m), dec(a, m), "0", dec(b, lb), true);

        Limbs r = mul(a, m, b, lb, c, id, depth + 1, "piece0");
        Limbs hi = mul(a + m, la - m, b, lb, c, id, depth + 1, "piece1");
        std::string p0, p1;
        if (c.tr) { 
            p0 = toDecimal(r); 
            p1 = toDecimal(hi); 
        }

        addShifted(r, hi, m);
        if (c.tr) 
            c.tr->combinePieces(id, parentId, depth, {p0, p1}, toDecimal(r));
        
        return r;
    }
 
    const uint32_t *x0 = a, *x1 = a + m, *y0 = b, *y1 = b + m;
    size_t lx1 = la - m, ly1 = lb - m;
    if (c.tr)
        c.tr->split(id, parentId, depth, role, dec(a, la), dec(b, lb), static_cast<long long>(m), dec(x1, lx1), dec(x0, m), dec(y1, ly1), dec(y0, m), false);
 
    Limbs z0 = mul(x0, m, y0, m, c, id, depth + 1, "z0");
    Limbs sx = add(x0, trimLen(x0, m), x1, lx1);
    Limbs sy = add(y0, trimLen(y0, m), y1, ly1);
    Limbs z1 = mul(sx.data(), sx.size(), sy.data(), sy.size(), c, id, depth + 1, "z1");
    Limbs z2 = mul(x1, lx1, y1, ly1, c, id, depth + 1, "z2");
 
    Limbs mid = sub(sub(z1, z0), z2);
 
    Limbs r = z0;
    addShifted(r, mid, m);
    addShifted(r, z2, 2 * m);
    if (c.tr)
        c.tr->combine(id, parentId, depth, toDecimal(z0), toDecimal(z1), toDecimal(z2), toDecimal(mid), toDecimal(r));
    
    return r;
}
 
}


Limbs karatsubaMultiply(const Limbs &a, const Limbs &b, size_t cutoff,  KaraTracer *tracer) {
    if (cutoff < 4)
        cutoff = 4;

    Ctx c{cutoff, tracer};
    return mul(a.data(), a.size(), b.data(), b.size(), c, -1, 0, nullptr);
}