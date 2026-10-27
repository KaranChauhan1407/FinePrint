# C++ HTTP Server

A basic HTTP/1.1 static file server built from scratch in C++ using TCP sockets and POSIX socket APIs.

## Technologies

* C++
* C++17
* POSIX Sockets
* TCP/IP
* HTTP/1.1
* Git & GitHub

## Features

* TCP socket-based server
* HTTP request parsing
* Supports `GET` requests
* Dynamic file serving based on the requested URL
* Serves static files from the `public/` directory
* MIME type detection
* `200 OK` responses
* `404 Not Found` responses
* Dynamic `Content-Length` headers
* HTML, CSS, JavaScript, JSON, text and SVG file support

## Project Structure

```text
HTTP-Server/
├── Server.cpp
├── Parser.h
├── MimeType.h
├── public/
│   ├── index.html
│   ├── 404.html
│   ├── style.css
│   ├── script.js
│   ├── data.json
│   ├── test.txt
│   └── svg-test.svg
└── .gitignore
```

## How It Works

The server uses TCP sockets to listen for incoming connections.

The basic process is:

```text
Browser
   ↓
HTTP GET request
   ↓
TCP connection
   ↓
Server accepts connection
   ↓
HTTP request parser
   ↓
Extract method, path and HTTP version
   ↓
Find requested file
   ↓
Determine MIME type
   ↓
Build HTTP response
   ↓
Send response to browser
```

For example, when the browser requests:

```http
GET /style.css HTTP/1.1
```

the server maps the request to:

```text
public/style.css
```

It then determines that the file is CSS and sends:

```http
HTTP/1.1 200 OK
Content-Type: text/css
Content-Length: ...
```

If the requested file doesn't exist, the server returns the `404.html` page with a `404 Not Found` response.

## What I Learned

While building this project, I learned how the different layers involved in serving a web page fit together.

### Networking

* Creating TCP sockets
* `getaddrinfo()`
* `socket()`
* `bind()`
* `listen()`
* `accept()`
* `recv()`
* `send()`
* Closing sockets with `close()`

### HTTP

* HTTP request structure
* Request methods
* Request paths
* HTTP versions
* HTTP response status codes
* HTTP headers
* MIME types
* `Content-Length`

### C++

* String manipulation
* File handling
* Header files
* Structs
* Functions and separation of responsibilities
* Working with sockets and system APIs

### Debugging

I also learned how to inspect the HTTP requests sent by a real browser and use those requests to understand what my server needs to handle.

## How to Run

### Requirements

* Linux/WSL
* `g++`
* C++17 compatible compiler

### 1. Clone the repository

```bash
git clone <your-repository-url>
cd <repository-name>
```

### 2. Compile

```bash
g++ Server.cpp -std=c++17 -o Server
```

### 3. Run

```bash
./Server
```

The server listens on port `3490`.

### 4. Open in a browser

Go to:

```text
http://localhost:3490/
```

You can also test individual files:

```text
http://localhost:3490/style.css
http://localhost:3490/script.js
http://localhost:3490/data.json
http://localhost:3490/test.txt
http://localhost:3490/svg-test.svg
```

To test the 404 response, request a file that doesn't exist:

```text
http://localhost:3490/does-not-exist.html
```

## Current Limitations

This is a learning project and is intentionally a simple HTTP server.

It currently focuses on basic HTTP/1.1 `GET` requests and static file serving. It is not intended to be a production-ready web server.

## Future Improvements

Possible future improvements include:

* Better error handling
* Binary file support
* Support for additional HTTP methods
* Handling malformed HTTP requests
* Path traversal protection
* Handling multiple clients concurrently
