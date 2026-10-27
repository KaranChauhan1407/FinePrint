#include <iostream>
#include <string>
#include <vector>

struct HttpRequest {
    std::string method;
    std::string path;
    std::string version;
};


struct HttpRequest Parser(char msg[]){
    struct HttpRequest values;
    std::vector<std::string*> list = {&values.method , &values.path , &values.version};
    int i = 0;
    for(int ind = 0 ; ind < list.size() ; ind++){
        while(msg[i] != ' ' && msg[i] != '\n' && msg[i] != '\r'){
            (list[ind]) -> push_back(msg[i]);
            i++;
            if (i == 500) return values;
        }
        if (msg[i] == '\n' || msg[i] == '\r') break;
        i++;
    }
    return values;
}