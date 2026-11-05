# The Moth cookbook

Short recipes for things people do: each starts from a task, gives the whole program, and shows what it says.
Every recipe here is run as it's written on every push to Moth (`cookbook.test.js`), so what you read is what
the code does today. They're on the site too, at
[samyyy2423.github.io/moth/docs/cookbook/](https://samyyy2423.github.io/moth/docs/cookbook/).

- [Read and write CSV and JSON](csv-and-json.md): totals from a spreadsheet's CSV, written out as JSON and
  CSV again.
- [Call a web API](web-api.md): ask GitHub's API for JSON, with headers and a token, send it some, and handle
  what goes wrong.
- [A web API with a database](web-api-with-a-database.md): a to-do service over HTTP, kept in SQLite, built
  into one program.
- [A command-line tool with options](command-line-tool.md): `--top 3`, `-k`, names after them and a `--help`,
  as argparse does.
- [A data script: statistics and a chart](data-script.md): means, spread, correlation and a straight line,
  and charts saved as SVG.
- [A game](game.md): a window drawn 60 times a second, keys, things that fall, and a score.
- [Work on every core](every-core.md): the same work split across every core, with workers and with
  cores.moth.
- [Testing](testing.md): `test_` functions, `expect`, what a failure says, and testing what's always so.

To try one, [download Moth](https://github.com/samyyy2423/moth/releases/latest), save the recipe's files in a
folder, and run the commands it shows there. [The standard library](https://samyyy2423.github.io/moth/docs/)
has every function the recipes use, each with an example.
