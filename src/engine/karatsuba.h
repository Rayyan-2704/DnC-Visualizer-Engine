/*
    karatsuba.h - Karatsuba integer multiplication on base-10^9 limb arrays.
*/

#pragma once
#include <cstddef>

#include "bignum.h"

class KaraTracer; 

big::Limbs karatsubaMultiply(const big::Limbs &a, const big::Limbs &b, size_t cutoff, KaraTracer *tracer = nullptr);