/*
    mergesort.h - Time Complexity of O(n*log(n)).
*/

#pragma once
#include <cstddef>
#include <vector>

template <class T, class Less>
void mergeRuns(T *a, T *tmp, size_t mid, size_t n, Less less) {
    if (mid == 0 || mid == n)
        return;

    if (!less(a[mid], a[mid - 1]))
        return;  // already in order

    size_t i = 0, j = mid, k = 0;
    while (i < mid && j < n)
        tmp[k++] = less(a[j], a[i]) ? a[j++] : a[i++];
    
    while (i < mid)
        tmp[k++] = a[i++];

    while (j < n)
        tmp[k++] = a[j++];

    for (size_t t = 0; t < n; t++) 
        a[t] = tmp[t];
}

// Insertion sort for tiny pieces, merge sort above that. O(n*log(n)).
template <class T, class Less>
void mergeSortRange(T *a, T *tmp, size_t n, Less less) {
    if (n <= 16) {
        for (size_t i = 1; i < n; i++) {
            T v = a[i];
            size_t j = i;
            while (j > 0 && less(v, a[j - 1])) { 
                a[j] = a[j - 1]; 
                j--; 
            }
            a[j] = v;
        }
        return;
    }

    size_t mid = n / 2;
    mergeSortRange(a, tmp, mid, less);
    mergeSortRange(a + mid, tmp, n - mid, less);
    mergeRuns(a, tmp, mid, n, less);
}

template <class T, class Less>
void mergeSort(std::vector<T> &v, Less less) {
    std::vector<T> tmp(v.size());
    mergeSortRange(v.data(), tmp.data(), v.size(), less);
}