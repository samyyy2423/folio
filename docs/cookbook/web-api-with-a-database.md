# A web API with a database

You want a small service of your own: a to-do list other programs can read and change over HTTP, as JSON,
kept in a database so it's there after a restart. [`server.moth`](https://samyyy2423.github.io/moth/docs/server.html) answers the requests, and
[`sqlite.moth`](https://samyyy2423.github.io/moth/docs/sqlite.html) keeps the to-dos in a file, through the SQLite that comes with Windows and
Linux.

## The service

```moth file=todos.moth
use "server.moth" as web
use "sqlite.moth" as sqlite

set db to sqlite's open("todos.db")
sqlite's run(db, "create table if not exists todos (id integer primary key, title text not null, done integer not null default 0)")

to todo_with with id
    set found to sqlite's query_with(db, "select id, title, done from todos where id = ?", list of id)
    if length of found is 0
        return nothing
    end
    return item 1 of found
end

to answer with request
    set parts to split path of request by "/"     # "/todos/7" is "", "todos", "7"
    if item 2 of parts is not "todos"
        return record with status 404, body "There's nothing at " + path of request
    end
    if length of parts is 2                        # /todos
        if method of request is "GET"
            return sqlite's query(db, "select id, title, done from todos order by id")
        end
        if method of request is "POST"
            set given to json from body of request
            sqlite's run_with(db, "insert into todos (title) values (?)", list of item "title" of given)
            set made to sqlite's query(db, "select last_insert_rowid() as id")
            return record with status 201, body todo_with(item "id" of item 1 of made) as json, type "application/json"
        end
        return record with status 405, body "Ask for the to-dos with GET, or add one with POST"
    end
    set id to number of item 3 of parts            # /todos/7
    if todo_with(id) is nothing
        return record with status 404, body "There's no to-do " + id
    end
    if method of request is "PATCH"
        sqlite's run_with(db, "update todos set done = ? where id = ?", list of item "done" of (json from body of request), id)
        return todo_with(id)
    end
    if method of request is "DELETE"
        sqlite's run_with(db, "delete from todos where id = ?", list of id)
        return record with status 204
    end
    return todo_with(id)
end

web's serve(8080, answer)
```

The handler is given each request, a record: its `method`, `path`, `query`, `headers` and `body`. What it
gives back is the answer: a list or a dictionary goes as JSON, text as a page, and a record says the `status`,
the `body`, its `type` and `headers`. A `?` in SQL is a value given apart from it, so a title with a quote in
it is only ever a title.

Start it, letting it use sockets and SQLite (`--allow-libraries`) and keep its file (`--allow-read`,
`--allow-write`), and ask it from another terminal:

```console
$ moth run --allow-libraries --allow-read --allow-write todos.moth &
$ curl -s -d '{"title": "Buy milk"}' localhost:8080/todos
{"id":1,"title":"Buy milk","done":0}
$ curl -s -d '{"title": "Write a recipe"}' localhost:8080/todos
{"id":2,"title":"Write a recipe","done":0}
$ curl -s -X PATCH -d '{"done": 1}' localhost:8080/todos/1
{"id":1,"title":"Buy milk","done":1}
$ curl -s localhost:8080/todos
[{"id":1,"title":"Buy milk","done":1},{"id":2,"title":"Write a recipe","done":0}]
$ curl -s -X DELETE localhost:8080/todos/2
$ curl -s localhost:8080/todos/2
There's no to-do 2
```

`serve` answers this computer alone; `serve_everywhere` the networks it's on too. It serves many people at
once, keeps connections open between requests, and a handler that fails is answered 500, said on the error
output, and the server goes on.

## Build it into one program

```console
$ moth build todos.moth --allow-libraries --allow-read --allow-write
compiled todos.moth to machine code for Linux -> todos (... bytes)
```

`todos` (`todos.exe` on Windows) is the whole service, needing nothing installed: copy it to a server and run
it. `web's serve_on_workers(8080, answer, 4)` answers on four cores at once.

## See also

- [The guestbook](https://github.com/samyyy2423/moth/blob/main/docs/guestbook.md): a web app, with a page and
  a form, from start to finish.
- [postgres.moth](https://samyyy2423.github.io/moth/docs/postgres.html) and [mysql.moth](https://samyyy2423.github.io/moth/docs/mysql.html) for a database server, and
  [redis.moth](https://samyyy2423.github.io/moth/docs/redis.html) for Redis.
