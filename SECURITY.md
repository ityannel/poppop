# Security

PopCorn is an experimental interpreter and is not a sandbox.

PopCorn programs can read files and URLs with `Fetch`, send HTTP requests with
`PostFetch`, and write files with `WriteFile`. Run only code that you trust and
use an operating-system sandbox when evaluating third-party programs.

Please report vulnerabilities privately to the repository owner instead of
opening a public issue.
