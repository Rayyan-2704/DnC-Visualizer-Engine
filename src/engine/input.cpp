#include "input.h"

#include <cctype>
#include <cstdio>
#include <cstdlib>

bool readWholeFile(const std::string &path, std::string &out) {
    FILE* f = std::fopen(path.c_str(), "rb");
    if (!f)
        return false;
    
    out.clear();
    char buf[1 << 16];
    size_t got;
    while ((got = std::fread(buf, 1, sizeof buf, f)) > 0)
        out.append(buf, got);
    
    std::fclose(f);
    return true;
}

bool parsePointFile(const std::string &data, std::vector<double> &xs, std::vector<double> &ys, std::string &err) {
    const char* p = data.c_str();
    char* end = nullptr;
    long long n = std::strtoll(p, &end, 10);
    if (end == p || n < 0) { 
        err = "line 1: expected the number of points n"; 
        return false; 
    }
    
    p = end;
    xs.clear();
    ys.clear();
    xs.reserve(static_cast<size_t>(n));
    ys.reserve(static_cast<size_t>(n));
    for (long long i = 0; i < n; i++) {
        double x = std::strtod(p, &end);
        if (end == p) { 
            err = "line " + std::to_string(i + 2) + ": expected x coordinate"; 
            return false; 
        }

        p = end;
        double y = std::strtod(p, &end);
        if (end == p) { 
            err = "line " + std::to_string(i + 2) + ": expected y coordinate"; 
            return false; 
        }

        p = end;
        xs.push_back(x);
        ys.push_back(y);
    }

    while (*p && std::isspace(static_cast<unsigned char>(*p))) 
        ++p;

    if (*p) { 
        err = "extra data after the n points"; 
        return false; 
    }

    return true;
}

bool parseTwoNumbers(const std::string &data, std::string &a, std::string &b, std::string &err) {
    std::string lines[2];
    int count = 0;
    std::string cur;
    for (char c : data) {
        if (c == '\n') {
            if (!cur.empty()) { 
                if (count < 2) lines[count] = cur; 
                count++; 
            }
            cur.clear();
        }
        else if (c != '\r') {
            cur += c;
        }
    }

    if (!cur.empty()) { 
        if (count < 2) lines[count] = cur; 
        count++; 
    }


    if (count != 2) { 
        err = "expected exactly 2 non-empty lines, found " + std::to_string(count); 
        return false; 
    }

    for (int k = 0; k < 2; k++) {
        for (char c : lines[k])
            if (c < '0' || c > '9') { 
                err = "line " + std::to_string(k + 1) + ": not a non-negative integer in decimal digits"; 
                return false; 
            }

        size_t z = 0;
        while (z + 1 < lines[k].size() && lines[k][z] == '0') 
            z++;

        lines[k].erase(0, z);
    }

    a = lines[0];
    b = lines[1];
    return true;
}