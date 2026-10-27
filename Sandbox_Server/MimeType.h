#include <iostream>
#include <string>
#include <vector>

bool EndsWith(const std::string& str, const std::string& suffix)
{
    if (str.size() < suffix.size())
        return false;

    return std::equal(
        suffix.rbegin(),
        suffix.rend(),
        str.rbegin()
    );
}

std::string GetMimeType(const std::string& path)
{
    if (EndsWith(path, ".html"))
        return "text/html";

    if (EndsWith(path, ".css"))
        return "text/css";

    if (EndsWith(path, ".js"))
        return "text/javascript";

    if (EndsWith(path, ".png"))
        return "image/png";

    if (EndsWith(path, ".jpg"))
        return "image/jpeg";
    
    if (EndsWith(path , ".txt")){
        return "text/plain";
    }

    if (EndsWith(path , ".json")){
        return "application/json";
    }
    
    if (EndsWith(path , ".svg")){
        return "image/svg+xml";
    }

    return "application/octet-stream";
}