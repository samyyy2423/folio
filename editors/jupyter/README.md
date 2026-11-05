# Folio in Jupyter

[Folio](https://github.com/samyyy2423/folio) is a programming language that reads like plain English. This
is a Jupyter kernel for it: notebooks in JupyterLab, Jupyter Notebook, VS Code or anything else that runs
Jupyter kernels, with Folio in their cells.

- **Each cell has what the cells before it made**, as in `folio notebook` and the Folio shell: its
  variables, functions and kinds, and the files it uses.
- **A cell whose last line is a value shows it**: `xs`, `square(4)`, `length of names`.
- **A cell that fails keeps nothing it made.** Its mistake comes as Jupyter's error, with the line and
  where in it, as `cell 3:1:5: there is no item 9, the list only has 3 items`, numbered as Jupyter
  numbers the cell.
- **`ask` asks in the notebook**, in Jupyter's input box.
- **Stopping a cell** (the ■ button, or Interrupt) stops that cell alone: what the cells before it made
  stays. Restarting starts with nothing.

## Installing

You need `folio` (from [the releases](https://github.com/samyyy2423/folio/releases), or `node bootstrap.mjs`
in the repository) on your PATH, or the `FOLIO` variable set to where it is, and Python 3.8 or later with
Jupyter:

```bash
pip install jupyterlab                              # or notebook, or just ipykernel for VS Code
python editors/jupyter/folio/folio_kernel.py install  # the "Folio" kernel, for you
jupyter lab                                         # then a new notebook, Folio
```

`install` puts the kernel where Jupyter looks for it, set to run with the Python you ran it with, so that
Python needs ipykernel. `install --sys-prefix` puts it in that Python's environment instead (a virtualenv's,
or conda's), and `install --prefix <folder>` in a folder of your own. `jupyter kernelspec install
editors/jupyter/folio --user` installs the folder as it is, which runs `python` from your PATH.
`jupyter kernelspec remove folio` takes it away.

## What cells may do

A notebook's code is your own, as a Python notebook's is, so cells may read and write files, go online,
start programs and use libraries without asking. `FOLIO_KERNEL_ALLOW` narrows that, with the flags `folio run`
takes, before Jupyter starts:

```bash
FOLIO_KERNEL_ALLOW="--allow-read --allow-net=api.example.com" jupyter lab
```

## How it works

`folio_kernel.py` is a wrapper kernel, ipykernel's `Kernel` with `do_execute`, that starts `folio kernel` in
the notebook's folder and gives it each cell, in a file of its own. `folio kernel` runs a cell as the Folio
shell runs an entry: a program built from the cells before it and this one, which loads the values the
cells before it kept and keeps its own for the next. Output comes as the cell's program writes it: when its
buffer is half full, or it asks, fails or ends, so the lines of a long cell can come together. Stopping a
cell stops the program running it; on Windows that needs `pip install psutil` to find the program, or
Folio is started again, with nothing kept. DESIGN.md §122 has more.

Its tests run a stand-in for `folio kernel`, folio itself, and, with ipykernel and jupyter_client installed,
the kernel as Jupyter runs it:

```bash
FOLIO=./folio python editors/jupyter/test_folio_kernel.py
```
