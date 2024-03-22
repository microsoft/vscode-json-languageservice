/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FileSystemProvider, FileType } from "../../jsonLanguageTypes";
import { URI } from 'vscode-uri';
import { stat as fsStat } from 'fs';

export function getFsProvider(): FileSystemProvider {
	return {
		stat(documentUriString: string) {
			return new Promise((c, e) => {
				const documentUri = URI.parse(documentUriString);
				if (documentUri.scheme !== 'file') {
					e(new Error('Protocol not supported: ' + documentUri.scheme));
					return;
				}
				fsStat(documentUri.fsPath, (err, stats) => {
					if (err) {
						if (err.code === 'ENOENT') {
							return c({
								type: FileType.Unknown,
								ctime: -1,
								mtime: -1,
								size: -1
							});
						} else {
							return e(err);
						}
					}

					let type = FileType.Unknown;
					if (stats.isFile()) {
						type = FileType.File;
					} else if (stats.isDirectory()) {
						type = FileType.Directory;
					} else if (stats.isSymbolicLink()) {
						type = FileType.SymbolicLink;
					}

					c({
						type,
						ctime: stats.ctime.getTime(),
						mtime: stats.mtime.getTime(),
						size: stats.size
					});
				});
			});
		},
	};
}
