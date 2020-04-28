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
							'pubDate': pubDate.format()
						}
						
						results[pubDate.format(dateFormat)][type].push(fileData)
					}
				}
			}
		}	
	}

	return results;
}

function rssGenerate(results: any, docUrl: string, repoTitle: string) {
	var RSS = require('rss-generator');
	let feedOptions = {
		title: repoTitle,
		description: "Updated articles for " + repoTitle,
		feed_url: docUrl + "/changelog.xml",
		site_url: docUrl
	}

	var feed = new RSS(feedOptions);
	for (let time in results) {
		['new', 'updated'].forEach(function (type: string) {
			if (results[time][type].length > 0) {
				for(var article of results[time][type]) {
					feed.item({
						title: article.title,
						description: article.description,
						url: article.docsUrl,
						categories: [type],
						date: article.pubDate
					})
				};
			}
		});
	}

	return feed;
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
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "docschangelog" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
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
		const genRss: boolean = vscode.workspace.getConfiguration().get('docLog.genRss') || true;

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
ms.service: {{ msSubService }}

---

<!-- This page is automatically generated by build/whatsnew.  Do not edit by hand -->

# What's new for {{ repoTitle }}
{{#if genRss}}
[*Available as an RSS Feed*](./rss.xml)

{{/if}}
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
						'msService': msService,
						'msSubService': msSubService,
						'genRss': genRss}), 'utf-8', function (err: any) {
					if (err) return console.log(err);
					console.log('Changelog written to ' + outputFile);
					});

				if (genRss) {
					let rssFile = workspacePath + '/' + docFolder + '/rss.xml';
					var feed = rssGenerate(results, docUrl, repoTitle).xml({indent: true});
					fs.writeFileSync(rssFile, feed, 'utf-8', function (err: any) {
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
