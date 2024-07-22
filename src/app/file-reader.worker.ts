/// <reference lib="webworker" />

import * as XLSX from 'xlsx';

addEventListener('message', async ({ data }) => {
  const { files } = data;

  const processFile = async (file: File) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event: any) => {
        const arrayBuffer = event.target.result;
        const wb: XLSX.WorkBook = XLSX.read(arrayBuffer, { type: 'array' });
        const wsname: string = wb.SheetNames[0];
        const ws: XLSX.WorkSheet = wb.Sheets[wsname];
        const jsonData = XLSX.utils.sheet_to_json(ws, { blankrows: false });
        resolve(jsonData);
      };
      reader.onerror = (error) => reject(error);
      reader.readAsArrayBuffer(file);
    });
  };

  try {
    const results: any = await Promise.all(
      files.map((file: any) => processFile(file))
    );
    postMessage(results.flat());
  } catch (error: any) {
    postMessage({ error: error.message });
  }
});
