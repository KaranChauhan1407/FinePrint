#include <iostream>
#include <sys/types.h>
#include <sys/socket.h>
#include <netdb.h>
#include <stdio.h>
#include <string.h>
#include <arpa/inet.h>
#include <netinet/in.h>
#include <unistd.h>
#include <fstream>
#include <csignal>
#include <algorithm>
#include "Parser.h"
#include "MimeType.h"

std::string PUBLIC_DIR = "public";

std::string ReadFile(std::string filename , int& exist){
    // Block "../" so nobody can read files outside public/
    if (filename.find("..") != std::string::npos) filename = "/404.html";
    std::fstream str(PUBLIC_DIR + filename , std::ios::in | std::ios::binary);
    if (str.fail()){
        exist = 0;
        if (filename == "/404.html") return "<h1>404 Not Found</h1>";   // stop: no endless recursion
        return ReadFile("/404.html" , exist);
    }
    std::string temp;
    std::string body;
    while(std::getline(str , temp)){
        body += temp;
        body.push_back('\n');
    }
    return body;
}

void Responses(struct HttpRequest values , int clientsock){
    std::string response;
    int exist = 1;
    std:: string filename = values.path.substr(0, values.path.find('?'));
    if (filename == "/") filename = filename + "test-terms.html";
    std::string body = ReadFile(filename , exist);
    std::string mimetype;
    if (exist) mimetype = GetMimeType(filename);
    if (mimetype.rfind("text/", 0) == 0) mimetype += "; charset=utf-8";
    if (exist){
        response =
        "HTTP/1.1 200 OK\r\n"
        "Content-Type: "+mimetype+"\r\n"
        "Content-Length: " + std::to_string(body.size()) + "\r\n"
        "Content-Disposition: inline\r\n"
        "Connection: close\r\n"
        "\r\n" +
        body;
    }
    else{
        response =
        "HTTP/1.1 404 Not Found\r\n"
        "Content-Type: text/html; charset=utf-8\r\n"
        "Content-Length: " + std::to_string(body.size()) + "\r\n"
        "Content-Disposition: inline\r\n"
        "Connection: close\r\n"
        "\r\n" +
        body;
    }
    send(clientsock , response.c_str() , response.size() , 0);
}

int main(int argc, char* argv[]){
    signal(SIGPIPE, SIG_IGN);   // macOS: don't die when the browser closes a connection early

    // Find public/ whether you start the server from Sandbox_Server/ or from the project root
    std::string exe = argv[0];
    std::string exeDir = exe.find('/') != std::string::npos ? exe.substr(0, exe.rfind('/')) : ".";
    for (std::string cand : {std::string("public"), exeDir + "/public", std::string("Sandbox_Server/public")}){
        std::fstream test(cand + "/test-terms.html", std::ios::in);
        if (!test.fail()){ PUBLIC_DIR = cand; break; }
    }

    struct addrinfo hints , *res;
    memset(&hints , 0 ,sizeof hints);
    hints.ai_family = AF_INET;          // IPv4 — localhost works on every Mac
    hints.ai_socktype = SOCK_STREAM;
    hints.ai_flags = AI_PASSIVE;
    if (getaddrinfo(NULL , "3490" ,&hints , &res) != 0){ perror("getaddrinfo"); return 1; }
    int servsock = socket(res->ai_family , res->ai_socktype,res->ai_protocol);
    int yes = 1;
    setsockopt(servsock, SOL_SOCKET, SO_REUSEADDR, &yes, sizeof yes);   // restart without "address in use"
    if (bind(servsock , res->ai_addr,res->ai_addrlen) == -1){
        perror("bind failed (is another server already running on port 3490? try: lsof -i :3490)");
        return 1;
    }
    freeaddrinfo(res);
    if (listen(servsock ,10) == -1){ perror("listen"); return 1; }
    std::cout << "FinePrint test server running: http://localhost:3490/test-terms.html  (serving " << PUBLIC_DIR << "/)" << std::endl;

    struct sockaddr_storage clientaddr;
    while(true){
        socklen_t clientsize = sizeof clientaddr;
        int clientsock = accept(servsock, (struct sockaddr*)&clientaddr ,&clientsize);
        if (clientsock == -1) continue;
        char buffer[4096];
        int n = recv(clientsock, buffer, sizeof(buffer) - 1, 0);
        if (n <= 0){ close(clientsock); continue; }
        buffer[n] = '\0';
        HttpRequest values;
        values = Parser(buffer);
        if (values.path.empty()) values.path = "/";
        Responses(values , clientsock);
        close(clientsock);
    }
    close(servsock);
    return 0;
}
