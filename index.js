#!/usr/bin/env node
const fs = require('fs');
const { resolve } = require('path');

const [, , collectionPath, environmentPath] = process.argv;

const collection = require(resolve(collectionPath));

// TODO: Extrair método
// -- início extração
let environmentVariables = {};
let collectionVariables = {};

if (collection.variable && !!collection.variable.length) {
    collectionVariables = collection.variable.reduce((variableMap, variable) => {
        variableMap[`{{${variable.key}}}`] = variable.value;
        return variableMap;
    }, {});
}

if (environmentPath) {
    environmentVariables = require(resolve(environmentPath));
    environmentVariables = environmentVariables.values.reduce((variableMap, variable) => {
        if (variable.enabled) variableMap[`{{${variable.key}}}`] = variable.value;
        return variableMap;
    }, {});
}

const environment = Object.assign({}, collectionVariables, environmentVariables);
// -- fim extração

const docsPath = `${__dirname}/docs`;

const upsertDir = (path) => {
    if (!fs.existsSync(path)) {
        fs.mkdirSync(path);
    }
};

const template = (str) => {
    return str.replace(/({{[^\}]*}})/g, (_, key) => {
        return environment[key] || key;
    });
};

const parseSubFolder = (subfolder, parentDir) => {
    const { name, item } = subfolder;
    const currentDir = `${parentDir}/${name.toLowerCase().replace(/\s/g, '-')}`;
    upsertDir(currentDir);

    if (item && item.length) {
        walkItems(item, currentDir);
    }
};

const queryToMarkdown = (query) => {
    const markdown = [`| Key | Value | Description |`, `| --- | --- | --- |`];

    query.forEach((q) => {
        const { key, value, description } = q;
        markdown.push(`| ${key || ''} | ${value || ''} | ${description || ''} |`);
    });

    return markdown.join('\n');
};

const headersToMarkdown = (headers) => {
    const markdown = [`| Key | Value | Description | Type |`, `| --- | --- | --- | --- |`];
    headers.forEach((header) => {
        const { key, value, description, type } = header;
        markdown.push(`| ${key || ''} | ${value || ''} | ${description || ''} | ${type || ''} |`);
    });

    return markdown.join('\n\n');
};

const parseRequest = (item, currentDir) => {
    const {
        request: {
            method,
            header,
            url: { query, path: originalPath },
            body,
            description,
        },
        name,
        response,
    } = item;

    const markdown = [`## ${name}\n`];

    if (description) markdown.push(`${description}\n`);

    markdown.push(`**Method:** \`\`\`${method}\`\`\`\n`);
    markdown.push(`**URL:** \`\`\`/${(originalPath || ['']).join('/')}\`\`\`\n`);

    if (query && query.length) {
        markdown.push(`**Query Parameters:**\n\nYou can include the following parameters in a search request.\n`);
        markdown.push(queryToMarkdown(query));
        markdown.push('\n');
    }
    if (header && header.length) {
        markdown.push(`**Headers**\n`);
        markdown.push(headersToMarkdown(header));
    }
    // Only handle raw bodies
    if (body && body.mode === 'raw') {
        markdown.push(`**Body**\n`);
        markdown.push(`\`\`\`\n${body.raw}\n\`\`\`\n`);
    }
    if (response && response.length) {
        markdown.push(`\n**Example Responses**\n`);

        // TODO: Extrair método
        response.forEach((r) => {
            markdown.push(`* _${r.name}_\n`);

            const {
                originalRequest: {
                    url: { path, query },
                },
                code,
                status,
                _postman_previewlanguage: language,
                body,
            } = r;

            if ((path || ['']).join() !== (originalPath || ['']).join())
                markdown.push(`**URL:** \`\`\`/${(path || ['']).join('/')}\`\`\`\n`);

            if (query && query.length) {
                markdown.push(
                    `**Query Parameters:**\n\nYou can include the following parameters in a search request.\n`,
                );
                markdown.push(queryToMarkdown(query));
                markdown.push('\n');
            }

            // FIXME: Resolver alinhamento de tabulação para content
            markdown.push(`**Code:** \`\`\`${code} ${status.toUpperCase()}\`\`\`\n`);
            markdown.push(`**Content:**\n\`\`\`${language}\n${body}\n\`\`\`\n`);
        });
    }

    fs.appendFileSync(`${currentDir}/README.md`, template(markdown.join('\n')));
};

const walkItems = (items, currentDir) => {
    items.forEach((item) => {
        if (item._postman_isSubFolder || item.item) {
            parseSubFolder(item, currentDir);
            return;
        }

        parseRequest(item, currentDir);
    });
};

// TODO: extrair
const { name, description } = collection.info;

const { item, auth } = collection;

const currentDir = `${docsPath}/${name}`;

// FIXME: Criar recursivo?
upsertDir(docsPath);
upsertDir(currentDir);

// Consider doing this at the end and adding a table of contents first
let markdown = [`# ${name}\n\n${description || ''}\n`];

if (auth) {
    markdown.push(`## Authorization\n`);
    markdown.push(`**type:** \`\`\`${auth.type}\`\`\`\n`);
    markdown.push(`**Header:** \`\`\`${auth[auth.type][1].value}: ${auth[auth.type][0].value}\`\`\`\n\n`);
}

fs.writeFileSync(`${currentDir}/README.md`, template(markdown.join('\n')));

walkItems(item, currentDir);
