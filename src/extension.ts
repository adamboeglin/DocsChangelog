// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
const spawnSync = require('child_process').spawnSync;
const moment = require('moment');
const matter = require('gray-matter');
const Handlebars = require("handlebars");
const fs = require('fs');

// Exclude paths in exclude list
function checkExclude(this: any, fsPath: any) {
	return this.includes(fsPath)
}

// Create a link to the public URL
function pubLink(path: string, docFolder: string, docUrl: string) {
	// Only include path after docs folder
	let filePath = path.substring(path.indexOf(docFolder) + docFolder.length, path.length)

	// remove file extension
	filePath = filePath.split('.').slice(0, -1).join('.');

	// remove trailing /index from URL
	if ( filePath.match('/index$')) {
		filePath = filePath.substring( 0, filePath.match( "/index$" )!.index );
	}
	return docUrl + filePath;
}

// Check to see if file exists anywhere else in array
function fileSearch(nameKey: string, myArray: string | any[]){
    for (let i=0; i < myArray.length; i++) {
        if (myArray[i].fileName === nameKey) {
            return myArray[i];
        }
    }
}


// Process commit log to generate file
function processCommits(results: any, type: string, workspacePath: string, monthsAgo:number, dateFormat:string, minChangedLines: number,
				excludePaths: string[], repoUrl: string, docFolder: string, docUrl: string) {
	let fileMod = ''
	switch(type) {
		case 'new':
			fileMod = 'A';
			break;
		case 'updated':
			fileMod = 'M';
			break;
		default:
			fileMod = '';
			break;
	  } 
	
	const startDate = moment().subtract(monthsAgo, 'months').startOf('month').format('YYYY-MM-DD');

	let gitLog = spawnSync('git', 
		['log', 
			'-m',
			'--first-parent',
			'--remove-empty',
			'--numstat',
	  		'--date=local',
			'--since='+ startDate,
			'--diff-filter=' + fileMod, 
			'--pretty=format:"commit|%h|%aN|%ae|%at"',
			'--',
			'*.md'
		],
		{ 
			'cwd': workspacePath,
			'maxBuffer': 1024 * 10240,
			'shell': true
		});

	let lines = gitLog.stdout.toString().split('\n');

	for (let i = 0; i < lines.length; i++) {
		let line=lines[i];
		if (!line.length) {
			continue;
		} else
		if (line.startsWith('commit')) {
			let commitParts = line.split('|');
			var pubId = commitParts[1];
			var pubName = commitParts[2];
			var pubEmail = commitParts[3];
			var pubDate = moment.unix(commitParts[4]);

			if (!results[pubDate.format(dateFormat)]) {
				results[pubDate.format(dateFormat)] = { 
					'new': [],
					'updated': []
				}
			}
		} else
		{
			let fileChange = line.split('\t');
			let linesAdded = fileChange[0];
			let linesRemoved = fileChange[1];
			let fileName = workspacePath + '/' + fileChange[2];

			// Remove files from build or includes directory
			if (excludePaths.some(checkExclude, fileName)) {
				continue;
			}

			if (!fileSearch(fileName, results[pubDate.format(dateFormat)].updated)) {
				// Only report on files that still exist
				if (fs.existsSync(fileName)) {
					if ((linesAdded - linesRemoved) > minChangedLines) {
						const file = matter.read(fileName);
						let fileData = {
							'title': file.data['title'],
							'description': file.data['description'],
							'linesAdded': linesAdded,
							'linesRemoved': linesRemoved,
							'pubId': pubId,
							'gitHubUrl': repoUrl + '/commit/' + pubId,
							'docsUrl': pubLink(fileName, docFolder, docUrl),
							'fileName': fileName,
							'pubDate': pubDate.toDate()
						}
						
						results[pubDate.format(dateFormat)][type].push(fileData)
					}
				}
			}
		}	
	}

	return results;
}

function feedGenerate(results: any, docUrl: string, repoTitle: string) {
	const Feed = require("feed").Feed;
	let feedOptions = {
		title: repoTitle,
		description: "Updated articles for " + repoTitle,
		feed_url: docUrl + "/feed.atom",
		site_url: docUrl
	}

	var updateFeed = new Feed(feedOptions);
	updateFeed.addCategory('new');
	updateFeed.addCategory('updated');

	for (let time in results) {
		['new', 'updated'].forEach(function (type: string) {
			if (results[time][type].length > 0) {
				for(var article of results[time][type]) {
					updateFeed.addItem({
						title: article.title,
						description: article.description,
						link: article.docsUrl,
						id: article.docsUrl,
						category: [{
								name: type,
								term: type
							}],
						date: article.pubDate
					})
				};
			}
		});
	}


	return updateFeed;
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	const vs: typeof vscode = require("vscode");

	async function pickWorkspace(): Promise<vscode.WorkspaceFolder | undefined> {
	  const workspaces = vs.workspace.workspaceFolders;
	  if (!workspaces) {
		return;
	  }
	  if (workspaces.length === 1) {
		return workspaces[0];
	  }
	  if (workspaces.length > 1) {
		return vs.window.showWorkspaceFolderPick({
		  placeHolder: "Select Workspace"
		});
	  }
  
	  return;
	}
	let disposable = vscode.commands.registerCommand('docschangelog.makeChangelog', async () => {
		// The code you place here will be executed every time your command is executed
		const workspaceFolder = await pickWorkspace();

		// Exclude these paths from matches
		const excludePaths: string[] = vscode.workspace.getConfiguration().get('docLog.excludePaths') || [
			"build/",
			"includes/",
			"browse/index.md",
			"changelog.md"
		];

		// How many lines must change to list a file as updated
		const minChangedLines: number = vscode.workspace.getConfiguration().get('docLog.minChangedLines') || 5;

		// Repository URL
		const repoUrl: string = vscode.workspace.getConfiguration().get('docLog.repoUrl') || "https://github.com/changeme";

		// Folder getting published
		const docFolder: string = vscode.workspace.getConfiguration().get('docLog.docFolder') || "docs";

		// Public URL
		const docUrl: string = vscode.workspace.getConfiguration().get('docLog.docUrl') || "https://docs.microsoft.com";

		// Date Format
		const dateFormat: string = vscode.workspace.getConfiguration().get('docLog.dateFormat') || "MMMM YYYY";

		// How far back to look for changes
		const monthsAgo: number = vscode.workspace.getConfiguration().get('docLog.monthsAgo') || 3;

		// What file to write to
		const outputFile: string = vscode.workspace.getConfiguration().get('docLog.outputFile') || "docs/changelog.md";

		// What file to write to
		const userName: string = vscode.workspace.getConfiguration().get('docLog.userName') || "changeUserName";

		// What file to write to
		const repoTitle: string = vscode.workspace.getConfiguration().get('docLog.repoTitle') || "Azure Architecture Center";

		// What file to write to
		const msService: string = vscode.workspace.getConfiguration().get('docLog.msService') || "architecture-center";

		// What file to write to
		const msSubService: string = vscode.workspace.getConfiguration().get('docLog.msSubService') || "meta";

		// What file to write to
		const genFeed: boolean = vscode.workspace.getConfiguration().get('docLog.genFeed') || true;

		if (!workspaceFolder) {
		  return;
		}

		const workspacePath = workspaceFolder.uri.fsPath;
		
		// Display a message box to the user
		await vs.window.withProgress(
			{
			  location: vs.ProgressLocation.Notification,
			  title: "Generating changelog",
			  cancellable: true
			}, async(progress, token) => {
				token.onCancellationRequested(() => {
					console.log("User canceled the long running operation");
				});
			//   const { stdout } = await execa(process.execPath, args, {
			// 	cwd
			//   });
	  
				// setTimeout(() => {
				// 	progress.report({ increment: 10, message: "I am long running! - still going..." });
				// }, 1000);

				const pageTemplateRaw = `---
title: {{ repoTitle }} What's New
description: New and updated articles for {{ repoTitle }}
author: {{ userName }}
ms.date: {{ today }}
ms.topic: article
ms.service: {{ msService }}
ms.subservice: {{ msSubService }}
---
<!-- This page is automatically generated by build/whatsnew.  Do not edit by hand -->

# What's new for {{ repoTitle }} {{#if genFeed}}[![Download Feed](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABmJLR0QA/wD/AP+gvaeTAAACw0lEQVQ4jW2STWhcVRTHf+d+vM5MQ5vUvAG1naSNikI1UKuVVNGFolDduDBdtI0IhQa6KNoiQnGhLvwAtxJXEVRQIhSpoksXgpDG1H4tWrGW0DZMkxnRdCZv3rv3uJg0GOLhXs5d3N/h/z/nCMC5I4Ov9qXph0ZMvzGIGEGMIAJigNW3oKh22sVC40b9xM5P/vxMLowPjlXvrU1mi02sE4w3WC8Yt/6KFYztFu+EMtdmr47J3MnddVpZuqE6wMYnR9GlOmH+InH+PMbq/8JiIHSURl3rziW+X7MOti+lsvcAd0JbTfJzUxS/fYHE5XVwyCJJ2acGEOMNsrxIdv47irlZiAVS6SN54jDlg1O4bY+ug4ssogGR+fdG1ObtNV7txk34nfvwj72GlHohFoSfPyC/eHoVDlkkNyWMGDBOSGqPsOnIKSovf4y//2nCpW/Iv95PvPkrGIfd+yZUd63CRRZBwYisNMk7TO9W3I6nSJ59m9Lol0hPSvjxGPH6GTCODS+8S6RMkUVirsSoGFYU0LhCduooxcwkZP8gvQP4lz4lVmosn34Lvd1AKltI9owRcyXkikYwIt0Com3izTOEmQnyqf3orUvgy/jn3ydfuk3rpwkAKntGidESOhGi/seCFfzwK/hnTiJJmc73b6CtJmbzVtyDL9Ka/hbNM6TUgxvcTcwVVboWxAo2HcKNvI55YB+ya5zirwbZzFcA+IeeI7TaZL9PA5DUhomFol0FqLECy03oLAEQF69RZJHOlV8AcNUhQq7kt+YAsJurxEJBReX6O4/X+++2qRiI/i60fA/ZH7OELBC0hB8aIRawNP0DrnofNt1OvjBP+/JZkm09dbkwPjg2MLxj0mlrzZLcGVXIldBZGVuhK9KhUttCs3HjkACcPbz9YLWWfuScrRKRGLqfNK7NqHaP1/rfC4vHH564+vm/Fu5mkriuRlEAAAAASUVORK5CYII=)]({{ repoUrl }}/feed.atom){{/if}}

{{#if genFeed}}
<link rel="alternate" type="application/atom+xml"
  title="New and updated articles for {{ repoTitle }}"
  href="{{ repoUrl }}/feed.atom" />

{{/if}}
New and updated articles for {{ repoTitle }}

{{#each results}}
## {{ @key }}

{{#if this.new.length}}
### New Articles

{{#each this.new}}
- [{{ this.title }}]({{ this.docsUrl }})
{{/each}}

{{/if}}
{{#if this.updated.length}}
### Updated Articles

{{#each this.updated}}
- [{{ this.title }}]({{ this.docsUrl }})  ([#{{pubId}}]({{ gitHubUrl}}))
{{/each}}
{{/if}}

{{/each}}`;
				let results: { [index:string]:any} = {};
				let types = ['new', 'updated'];

				types.forEach( function(type) {
					results = processCommits(results, type, workspacePath, monthsAgo, dateFormat, 
						minChangedLines, excludePaths, repoUrl, docFolder, docUrl);
				})


				let changeTemplate = Handlebars.compile(pageTemplateRaw);
				fs.writeFileSync(workspacePath + '/' + outputFile, 
					changeTemplate({
						'results':results, 
						'userName': userName, 
						'today': moment().format('MM/DD/YYYY'),
						'repoTitle': repoTitle,
						'repoUrl': repoUrl,
						'msService': msService,
						'msSubService': msSubService,
						'genFeed': genFeed}), 'utf-8', function (err: any) {
					if (err) return console.log(err);
					console.log('Changelog written to ' + outputFile);
					});

				if (genFeed) {
					let rssFile = workspacePath + '/' + docFolder + '/feed.atom';
					var feed = feedGenerate(results, docUrl, repoTitle);
					fs.writeFileSync(rssFile, feed.atom1(), 'utf-8', function (err: any) {
					if (err) return console.log(err);
						console.log('Changelog written to ' + rssFile);
					});
				}

			}
		  );
	  
		const document = await vs.workspace.openTextDocument(workspacePath + '/' + outputFile);
	  
		vs.window.showTextDocument(document);

	});

	context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() {}
