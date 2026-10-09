# Security policy

## Supported versions

Security fixes are published in a new release. Only the [latest release](https://github.com/myrvmsr/folio/releases/latest) is supported.

Folio's GitHub builds do not update themselves: to get a fix, download and install the latest version over the previous one.

## Report a vulnerability

Please **do not open a public issue** for a security problem.

Report it privately instead: in the **Security** tab of the repository, choose [**Report a vulnerability**](https://github.com/myrvmsr/folio/security/advisories/new). Only you and the maintainer can see the report.

Please include:

- your Folio version (**⋯ → About Folio**), operating system and how you installed Folio;
- the steps to reproduce the problem, ideally with a small Markdown file or folder;
- what an attacker could do with it.

## What counts as a security problem

For example:

- opening a Markdown file or folder runs code, or loads content that the HTML sanitizer should have blocked;
- Folio reads, changes or deletes files the user did not open or choose;
- a problem in the installers or Linux packages.

Bugs without a security impact belong in a regular [issue](https://github.com/myrvmsr/folio/issues).

## What happens next

Folio is maintained by one person in their spare time. You should receive a first reply within a week. Once the problem is confirmed, it will be fixed in a new release and described in a security advisory. If you wish, you will be credited for the discovery.
