# Docs Changelog

This VSCode extension is for users for the Microsoft Docs platform.  It simplifies the creation of a changelog of new and updated articles based on Git history

## Features

To generate the changelog, open the command window (Ctrl + Shift + P) and enter "Docs: Generate Changelog".  This will automatically generate the changelog.md file in the docs path configured.

## Requirements

Requires Git to be installed and available in your default path.

## Extension Settings

Include if your extension adds any VS Code settings through the `contributes.configuration` extension point.

For example:

This extension contributes the following settings:

* `docLog.repoTitle`: Title of the repo used in headers and metadata.
* `docLog.userName`: Git User name for author metadata field
* `docLog.minChangedLines`: The number of lines in a file that much be changed for it to appear as updated
* `docLog.excludePaths`: Excluded these paths from the changelog
* `docLog.repoUrl`: URL for public GitHub repository. Used for linking to GitHub to view changes
* `docLog.docFolder`: Folder that contains files to be scanned for changes
* `docLog.docUrl`: Public URL for repo
* `docLog.outputFile`: File to write changelog to
* `docLog.dateFormat`: Formatting for date in changelog, can be used to make more granular logs
* `docLog.monthsAgo`: How many months back to generate the logs for
* `docLog.msService`: ms.service metadata field
* `docLog.msSubService`: ms.subservice metadata field
* `docLog.genFeed`: Should an RSS feed be generated as well (docFolder/atom.xml)

## Known Issues

This is my first Typescript project, so the code needs a lot of work and optimization.

## Release Notes

### 0.1.0

Initial release.
