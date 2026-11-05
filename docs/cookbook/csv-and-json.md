# Read and write CSV and JSON

You have a spreadsheet's worth of sales as CSV, and want totals by region, written out as JSON for another
program, and as CSV again for the spreadsheet.

## The data

```text file=sales.csv
date,region,product,units,price
2026-10-01,North,Lamp,3,24.50
2026-10-01,South,Lamp,1,24.50
2026-10-02,North,Shade,5,9.99
2026-10-03,East,Lamp,2,24.50
2026-10-03,South,Bulb,12,1.25
```

## Read the CSV

`read table` reads a CSV file into a list of records, one a row, its fields named by the first row (in small
letters, with `_` for anything but letters and digits). A cell that's a number is a number.

```moth file=totals.moth
use "text.moth" as text

set sales to read table "sales.csv"
say length of sales " sales; the first: " item 1 of sales

set totals to empty dictionary
for each sale in sales
    set region to region of sale
    if not (region is in totals)
        set item region of totals to 0
    end
    set item region of totals to item region of totals + units of sale * price of sale
end

for each region in keys of totals
    say region ": " text's number_text(item region of totals, 2)
end

write totals as json to "totals.json"

set rows to list of (list of "region", "total")
for each region in keys of totals
    add (list of region, item region of totals) to rows
end
write text's csv_text(rows) to "totals.csv"
```

`x as json` writes any number, text, list, record or dictionary as JSON; `text's csv_text` writes a list of
rows, each a list, as CSV, quoting what needs it. Run it, letting it read and write files:

```console
$ moth run --allow-read --allow-write totals.moth
5 sales; the first: (record with date "2026-10-01", region "North", product "Lamp", units 3, price 24.5)
North: 123.45
South: 39.50
East: 49.00
```

```console
$ cat totals.json
{"North":123.45,"South":39.5,"East":49}
```

## Read JSON back

`json from` reads JSON text into Moth's own values: an object becomes a dictionary, an array a list, `true` and
`false` yes and no, and `null` nothing.

```moth file=check.moth
set totals to json from read "totals.json"
say keys of totals
say item "North" of totals

set people to json from "[{\"name\": \"Sam\", \"pets\": [\"cat\"]}, {\"name\": \"Ana\", \"pets\": []}]"
for each person in people
    say item "name" of person " has " length of item "pets" of person " pets"
end

say read "totals.csv"
```

```console
$ moth run --allow-read check.moth
["North", "South", "East"]
123.45
Sam has 1 pets
Ana has 0 pets
region,total
North,123.45
South,39.5
East,49
```

## When the JSON is wrong

`json from` stops the program on JSON it can't read. To carry on, read it in a `try`; and
[`json.moth`](https://samyyy2423.github.io/moth/docs/json.html)'s `parse` says where the mistake is:

```moth
use "json.moth" as json

try
    say json's parse("{\"name\": \"Sam\",}")
if it fails with why
    say "That isn't JSON: " why
end
```

```output
That isn't JSON: JSON, letter 16: expected a key in quotes but found }
```

## See also

- [text.moth](https://samyyy2423.github.io/moth/docs/text.html): `csv_rows` reads CSV that's in a text already, and `csv_text` writes it.
- [json.moth](https://samyyy2423.github.io/moth/docs/json.html), [yaml.moth](https://samyyy2423.github.io/moth/docs/yaml.html), [toml.moth](https://samyyy2423.github.io/moth/docs/toml.html) and [xml.moth](https://samyyy2423.github.io/moth/docs/xml.html)
  for other formats.
