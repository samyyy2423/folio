# Call a web API

You want to ask a web service for data, as JSON, and send it some: here, GitHub's REST API, for a
repository's stars and its open issues, and to open a new issue.

## Ask for JSON

[`http.moth`](https://samyyy2423.github.io/moth/docs/http.html)'s `get_json` asks a URL, checks the answer isn't a mistake (400 and up), and reads
its JSON into Moth's own values: an object as a dictionary, an array as a list.

```moth file=repo.moth
use "http.moth" as http

set name to "samyyy2423/moth"
if length of arguments is at least 1
    set name to item 1 of arguments
end

set repo to http's get_json("https://api.github.com/repos/" + name)
say item "full_name" of repo ": " item "description" of repo
say item "stargazers_count" of repo " stars, " item "forks_count" of repo " forks, " item "open_issues_count" of repo " open issues"
say "Licensed under the " item "name" of item "license" of repo
```

A program that goes online is run with `--allow-net`, and one that uses sockets, as http.moth does, with
`--allow-libraries`:

```console
$ moth run --allow-net --allow-libraries repo.moth
samyyy2423/moth: A programming language that reads like plain English
128 stars, 9 forks, 3 open issues
Licensed under the Apache License 2.0
```

(Your numbers will be today's.) Anything after the file is the program's own `arguments`, so
`moth run --allow-net --allow-libraries repo.moth python/cpython` asks about another.

## Headers, a status, and what went wrong

`request` takes a method, a URL, a body (or nothing) and headers of your own, and gives back a response: its
`status`, `reason`, `headers`, `text` and `body` (its bytes). It doesn't fail on a 404 or a 500: that's an
answer like any other, so look at the status.

```moth file=issues.moth
use "http.moth" as http
use "system.moth" as system

set headers to dictionary where "accept" is "application/vnd.github+json", "user-agent" is "moth-cookbook"
set token to system's environment("GITHUB_TOKEN")
if token is not nothing
    set item "authorization" of headers to "Bearer " + token
end

set url to "https://api.github.com/repos/samyyy2423/moth/issues?state=open&per_page=2"
set response to http's request("GET", url, nothing, headers)
if status of response is not 200
    say "GitHub said " status of response " " reason of response ": " text of response
    stop the program with 1
end
for each issue in json from text of response
    say "#" item "number" of issue "  " item "title" of issue
end
```

```console
$ moth run --allow-net --allow-libraries issues.moth
#42  A clearer message for a missing end
#41  Dates before 1970 on Windows
```

## Send JSON

A record, a list or a dictionary given as the body goes as JSON, with `Content-Type: application/json`.
Opening an issue needs a token; the key never goes in the code, only in the environment:

```moth file=open-issue.moth
use "http.moth" as http
use "system.moth" as system

set token to system's environment("GITHUB_TOKEN")
set headers to dictionary where "accept" is "application/vnd.github+json", "user-agent" is "moth-cookbook"
if token is not nothing
    set item "authorization" of headers to "Bearer " + token
end
set issue to record with title "Docs: a recipe for calling an API", body "Written in Moth."

set response to http's request("POST", "https://api.github.com/repos/samyyy2423/moth/issues", issue, headers)
if status of response is 201
    set made to json from text of response
    say "Opened #" item "number" of made ": " item "html_url" of made
else
    say "No: " status of response " " item "message" of (json from text of response)
end
```

```console
$ moth run --allow-net --allow-libraries open-issue.moth
No: 401 Requires authentication
```

With a token (one you made in GitHub's settings), it opens one; `GITHUB_TOKEN=... moth run ...` on Linux, or
`set GITHUB_TOKEN=...` first on Windows.

## Mistakes

A request fails only when it can't be made or answered: no network, a name that isn't a site, a certificate
that isn't right. `get_json` fails on a status of 400 and up too. Catch either with `try`:

```moth file=careful.moth
use "http.moth" as http

http's wait_at_most(5000)
try
    set repo to http's get_json("https://api.github.com/repos/samyyy2423/no-such-thing")
    say item "full_name" of repo
if it fails with why
    say "Couldn't ask GitHub: " why
end
```

```console
$ moth run --allow-net --allow-libraries careful.moth
Couldn't ask GitHub: the server said 404 Not Found to https://api.github.com/repos/samyyy2423/no-such-thing
```

## See also

- [http.moth](https://samyyy2423.github.io/moth/docs/http.html): `post`, `put`, `patch` and `delete`, forms with `form_of`, and `trust` for a
  company's own certificates.
- [oauth.moth](https://samyyy2423.github.io/moth/docs/oauth.html) to sign a person in and get a token for them; [ai.moth](https://samyyy2423.github.io/moth/docs/ai.html) for
  language models' APIs.
