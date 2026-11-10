/*
    json_out.h - the messages the engine prints on stdout (one JSON object per line).
*/

#pragma once
#include <cstdio>
#include <string>

inline std::string jsonEscape(const std::string &s) {
    std::string o;
    for (char ch : s) {
        unsigned char c = static_cast<unsigned char>(ch);

        if (c == '"') o += "\\\"";
        else if (c == '\\') o += "\\\\";
        else if (c == '\n') o += "\\n";
        else if (c == '\r') o += "\\r";
        else if (c == '\t') o += "\\t";
        else if (c < 0x20) { 
            char b[8]; std::snprintf(b, sizeof b, "\\u%04x", c); 
            o += b; 
        }
        else o += ch;
    }

    return o;
}

inline void emitHello() {
    std::printf("{\"type\":\"hello\",\"protocol\":1,\"engine\":\"daa-engine\",\"version\":\"0.1.0\"}\n");
    std::fflush(stdout);
}

inline void emitError(const char *code, const std::string &msg) {
    std::printf("{\"type\":\"error\",\"code\":\"%s\",\"message\":\"%s\"}\n", code, jsonEscape(msg).c_str());
    std::fflush(stdout);
}