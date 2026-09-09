// Assemble a portable comparison page from separate source markup, styles and behavior.
// @ts-check
import {readFile} from 'node:fs/promises';

/** @param {object} data @returns {Promise<string>} */
export async function buildGallery(data){
    const [html,css,script]=await Promise.all(['matrix.html','matrix.css','matrix.js'].map(name=>readFile(new URL(name,import.meta.url),'utf8')));
    return html.replace('/*STYLES*/',css).replace('/*DATA*/',JSON.stringify(data).replaceAll('<','\\u003c')).replace('/*SCRIPT*/',script);
}
