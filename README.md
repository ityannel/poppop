# PopCorn

> Experimental alpha — the syntax and runtime may change.

Current release: **PopCorn 1**

PopCorn is a small, pipeline-oriented programming language. Values move from
left to right through `>>`, and each statement ends with `.`.

```popcorn
[1, 2, 3] >> Map:
    @ * 2.
>> doubled.

doubled >> Display.
```

The current interpreter is implemented in Python. PopCorn is a language
experiment, not a production runtime or security sandbox.

## Install

PopCorn requires Python 3.10 or newer.

```bash
python -m pip install .
popcorn --version
```

For development:

```bash
python -m pip install -e ".[dev]"
python -m pytest
```

## Run

```bash
popcorn program.pop
```

Start the REPL by running `popcorn` without a file. Use `:quit` to exit.

From a source checkout, `python popcorn.py program.pop` is also supported.

## Test

A test is a function whose name starts with `Test`. Check results with
`Expect`, `Assert` and `ExpectError`, then run `popcorn test`:

```popcorn
(a, b) >> pop AddTwo:
    a + b.

pop TestAddTwo:
    (1, 2) >> AddTwo >> Expect(3).
    0 >> ExpectError(10 / @, "RuntimeError").
```

```bash
popcorn test                   # every *_test.pop under the current folder
popcorn test examples          # a folder
popcorn test calc_test.pop     # one file
```

Failures are reported in Japanese with the expected and actual values and a
hint. In the Playground, the Run button runs the tests after the program.
See chapter 17 of the specification.

## Playground

The browser Playground runs the same Python lexer, parser, evaluator, and
built-ins as the command-line interpreter through Pyodide. Its examples and
function reference are loaded from the current
`popcorn_specification.md`, rather than maintained as a separate language copy.
The **ロボット君** tab provides eight interactive Japanese lessons. Exercises
are evaluated by the real interpreter, with conversational feedback, hints,
answers, error guidance, and progress saved in the browser.

The example gallery uses consistent Japanese category names and includes
FizzBuzz, a fortune teller, number guessing, rock-paper-scissors, a dice game,
a quiz, a countdown, and smaller pipeline exercises.

Start it locally from the repository root:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`. Opening `index.html` directly is not
supported because browsers block the source requests used by the runtime.

For the AI tutor, deploy the Playground with Vercel and set `GEMINI_API_KEY` in
the Vercel project environment variables. The browser calls `/api/gemini`; the
API key stays on the server.

Local AI tutor testing is also available with the bundled Playground server:

```bash
GEMINI_API_KEY=your-key python popcorn_playground_server.py
```

On Windows PowerShell:

```powershell
$env:GEMINI_API_KEY = "your-key"
python popcorn_playground_server.py
```

Then open `http://127.0.0.1:8765`. The browser calls `/api/gemini`; the API key
stays on the server. If `/api/gemini` is not available, the Playground can still
ask for a personal browser key and save it locally.

For Vercel, import this GitHub repository, keep the default static deployment
settings, and add this environment variable:

```text
GEMINI_API_KEY=your-key
```

`api/gemini.js` is the Vercel Function used by ロボット君 to generate practice
problems and advice.

GitHub Pages is rebuilt automatically after relevant files are pushed to
`main` or `master`. The deployment packages every current `popcorn_lang`
Python module, so newly added interpreter modules are included without editing
the Playground loader.

## Language status

The language is documented in
[popcorn_specification.md](popcorn_specification.md).

The repository also contains the optional Japanese VS Code extension in
`vscode-popcorn`.

## Safety

PopCorn code can access the file system and network through built-ins such as
`ReadFile`, `WriteFile`, `Fetch`, `PostFetch`, and `HttpRequest`. Only run programs you trust. See
[SECURITY.md](SECURITY.md).

## License

MIT
