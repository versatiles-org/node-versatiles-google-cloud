[![Code Coverage](https://codecov.io/gh/versatiles-org/node-versatiles-google-cloud/branch/main/graph/badge.svg?token=IDHAI13M0K)](https://codecov.io/gh/versatiles-org/node-versatiles-google-cloud)
[![GitHub Workflow Status)](https://img.shields.io/github/actions/workflow/status/versatiles-org/node-versatiles-google-cloud/ci.yml)](https://github.com/versatiles-org/node-versatiles-google-cloud/actions/workflows/ci.yml)

# VersaTiles Server for Google Cloud Run

This tool solves perfectly the use cases, when you want to publish multiple map application using multiple versatiles tile sources in Google Cloud.
E.g. for data journalists, academia, ...

> \[!WARNING]
> It is strongly recommended:
>
> - always use a CDN in front of this server and
> - not to modify/overwrite existing files in the bucket, as this could result in corrupted data being delivered!

## Outline:

1. Store static files (\*.html, \*.js, \*.css, …) and map tiles (\*.versatiles) in a Google Storage Bucket.
2. Run this Node.js server in Google Cloud Run using Bucket name/path as argument
3. Put a Loadbalancer (with DNS and CDN) in front of the Google Cloud Run service.

- Now you can serve the files in the Bucket publicly.
- This server will make sure that every file will be compressed optimally according to "accept-encoding" header of the browser.
- \*.versatiles files will not be served. Instead the server will provide a simple GET API to access every tile, and serve them with optimal compression. E.g. tile x=4, y=5, z=6 in file `gs://bucket/map/earth.versatiles` could be accessed via `https://public.domain.com/map/earth.versatiles?tiles/6/4/5`

## Run in Google Cloud Run

Run the following Docker Container in Google Cloud Run, e.g. by using Google Cloud Build.

```Dockerfile
FROM node:20-alpine
RUN npm install -g @versatiles/google-cloud
EXPOSE 8080
CMD npx versatiles-google-cloud -b "$BASE_URL" "$BUCKET_NAME"
```

## Test locally

Install `@versatiles/google-cloud` globally and run:

```bash
npm install -g @versatiles/google-cloud
versatiles-google-cloud -f -l local/data/
```

Or clone and run the repo:

```bash
git clone https://github.com/versatiles-org/node-versatiles-google-cloud.git
cd node-versatiles-google-cloud
npm install
npm start -f -l local/data/
```

The arguments used:

- `-f` or `--fast-recompression` disables recompression, so it's faster if you're developing locally.
- `-l` or `--local-directory` uses a local directory instead of a Google Bucket.

Note that for security and performance reasons no file listing is implemented. If you have a file such as `local/data/app/index.html` you will need to open the correct URL in your browser to view the file: `http://localhost:8080/app/index.html`

## Options

<!--- This chapter is generated automatically --->

```console
$ versatiles-google-cloud
Usage: versatiles-google-cloud [options] <bucket-name>

Initialises a server to serve files from a specified Google Bucket to a Google
Load Balancer with CDN, handles HTTP headers and compression, and provides a
RESTful API for VersaTiles containers.
For more details, visit:
https://github.com/versatiles-org/node-versatiles-google-cloud/

Arguments:
  bucket-name                     Name of the Google Cloud Storage bucket.

Options:
  -b, --base-url <url>            Set the public base URL. Defaults to
                                  "http://localhost:<port>/".
  -d, --directory <prefix>        Set the bucket directory (prefix), e.g.,
                                  "/public/".
  -f, --fast-recompression        Enable faster server responses by avoiding
                                  recompression.
  -l, --local-directory <path>    Ignore bucket and use a local directory
                                  instead. Useful for local development and
                                  testing.
  -p, --port <port>               Set the server port. Default: 8080
  -r, --rewrite-rule <path|path>  Set a rewrite rule. Must start with a "/".
                                  E.g. "/tiles/osm/|/folder/osm.versatiles?"
                                  (default: [])
  -v, --verbose                   Enable verbose mode for detailed operational
                                  logs.
  -h, --help                      display help for command
```

## Dependency Graph

<!--- This chapter is generated automatically --->

```mermaid
---
config:
  layout: elk
---
flowchart TB

subgraph 0["src"]
1["index.ts"]
subgraph 2["lib"]
3["server.ts"]
subgraph 4["bucket"]
5["index.ts"]
6["bucket_google.ts"]
7["abstract.ts"]
A["metadata.ts"]
B["bucket_local.ts"]
J["bucket.mock.ts"]
end
8["recompress.ts"]
9["encoding.ts"]
C["responder.ts"]
D["response_headers.ts"]
E["rewrite.ts"]
subgraph F["versatiles"]
G["index.ts"]
H["cache.ts"]
I["versatiles.ts"]
end
K["responder.mock.ts"]
L["response_headers.mock.ts"]
end
end
1-->3
3-->5
3-->C
3-->E
3-->G
5-->6
5-->B
6-->7
6-->A
7-->8
8-->9
B-->7
B-->A
C-->9
C-->8
C-->D
D-->9
G-->H
H-->I
J-->7
J-->A
K-->C

class 0,2,4,F subgraphs;
classDef subgraphs fill-opacity:0.1, fill:#888, color:#888, stroke:#888;
```

## License

[Unlicense](./LICENSE.md)
