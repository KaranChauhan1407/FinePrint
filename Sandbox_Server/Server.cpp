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
#include "Parser.h"
#include "MimeType.h"

std::string ReadFile(std::string filename , int& exist){
    std::fstream str("public"+ filename , std::ios::in);
    if (str.fail()){
        exist = 0;
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
    std:: string filename = values.path;
    if (filename == "/") filename = filename + "test-terms.html";
    std::string body = ReadFile(filename , exist);
    std::string mimetype;
    if (exist) mimetype = GetMimeType(filename);
    if (exist){
        response =
        "HTTP/1.1 200 OK\r\n"
        "Content-Type: "+mimetype+"\r\n"
        "Content-Length: " + std::to_string(body.size()) + "\r\n"
        "Content-Disposition: inline\r\n"
        "\r\n" +
        body;
    }
    else{
        response =
        "HTTP/1.1 404 Not Found\r\n"
        "Content-Type: text/html\r\n"
        "Content-Length: " + std::to_string(body.size()) + "\r\n"
        "Content-Disposition: inline\r\n"
        "\r\n" +
        body;
    }
    send(clientsock , response.c_str() , response.size() , 0);
}

int main(){
    struct addrinfo hints , *res , *p;
    memset(&hints , 0 ,sizeof hints);
    hints.ai_family = AF_UNSPEC;
    hints.ai_socktype = SOCK_STREAM;
    hints.ai_flags = AI_PASSIVE;
    getaddrinfo(NULL , "3490" ,&hints , &res);
    int servsock = socket(res->ai_family , res->ai_socktype,res->ai_protocol);
    bind(servsock , res->ai_addr,res->ai_addrlen);
    freeaddrinfo(res);
    listen(servsock ,10);
    struct sockaddr clientaddr;
    socklen_t clientsize =  sizeof clientaddr;
    while(true){
        int clientsock = accept(servsock, &clientaddr ,&clientsize);
        char buffer[4096];
        int n = recv(clientsock, buffer, sizeof(buffer) - 1, 0);
        buffer[n] = '\0';
        HttpRequest values;
        values = Parser(buffer);
        Responses(values , clientsock);
        close(clientsock);
    }
    close(servsock);
    return 0;
}