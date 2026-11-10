/*
    input.h - reading and parsing the input files (formats: docs/protocol.md section 7).
*/

#pragma once
#include <string>
#include <vector>

bool readWholeFile(const std::string &path, std::string &out);

bool parsePointFile(const std::string &data, std::vector<double> &xs, std::vector<double> &ys, std::string &err);

bool parseTwoNumbers(const std::string &data, std::string &a, std::string &b, std::string &err);