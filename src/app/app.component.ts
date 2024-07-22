import { Component } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { gzip } from 'fflate';
import { map } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
})
export class AppComponent {
  constructor(private http: HttpClient) {}
  selectFile: any = [];
  selectFilePath: string = '';

  async upload() {
    try {
      if (typeof Worker !== 'undefined') {
        // Convert the files object to an array
        const filesArray = Object.keys(this.selectFile).map((key) => [
          this.selectFile[key],
        ]);

        const workers = [];

        const results = await Promise.all(
          filesArray.map((chunk) => {
            const worker = new Worker(
              new URL('./file-reader.worker', import.meta.url)
            );
            workers.push(worker);
            return this.processFilesWithWorker(worker, chunk);
          })
        );

        const mergedResults = this.mergeFinalResults(results.flat());
        await this.sendBatchesAndSummarize(mergedResults);
      } else {
        console.error('Web Workers are not supported in this environment.');
      }
    } catch (error) {
      console.log(error);
    }
  }

  onFileSelected(event: any) {
    this.selectFile = event.target.files;
    this.selectFilePath = event.target.value;
  }

  processFilesWithWorker(worker: any, files: any) {
    return new Promise((resolve, reject) => {
      worker.postMessage({ files });

      worker.onmessage = ({ data }: { data: any }) => {
        if (data.error) {
          reject(data.error);
        } else {
          resolve(data);
        }
        worker.terminate();
      };

      worker.onerror = (error: any) => {
        reject(error);
        worker.terminate();
      };
    });
  }

  mergeFinalResults(results: any) {
    const combinedMap: Map<string, any> = new Map();
    results.forEach((record: any) => {
      let key: string = '';
      let isCogs: boolean = false;
      if (record['Linked User ID']) {
        isCogs = true;
        key = `${record['Linked User ID']}_${record['Product Code']}`;
      } else if (record['User ID']) {
        key = `${record['User ID']}_${record['Product Code']}`;
      }

      if (!combinedMap.has(key)) {
        const newUsage = {
          uid: record['Linked User ID'] || record['User ID'],
          product_code: record['Product Code'],
          product_name: record['Product Name'],
          total_cogs: isCogs
            ? Number(record['Pretax Cost (Before Round Down Discount)'])
            : 0,
          total_sales: isCogs
            ? 0
            : Number(record['Pretax Cost (Before Round Down Discount)']),
          total_coupon: Number(record['Coupon Deduct']) || 0,
          qty: 1,
        };

        combinedMap.set(key, { ...newUsage });
      } else {
        const existingRecord = combinedMap.get(key);
        if (isCogs) {
          existingRecord.total_cogs += Number(
            record['Pretax Cost (Before Round Down Discount)']
          );
        } else {
          existingRecord.total_sales += Number(
            record['Pretax Cost (Before Round Down Discount)']
          );
        }
      }
    });
    return Array.from(combinedMap.values());
  }

  // async sendBatches(payload: any, batchSize = 300) {
  //   for (let i = 0; i < payload.length; i += batchSize) {
  //     const batch = payload.slice(i, i + batchSize);
  //     const compressedBatch = pako.gzip(JSON.stringify(batch));

  //     console.log(compressedBatch, 'pepepepe');

  //     // send the compressed batch to your endpoint
  //     await axios.post('/your-endpoint', compressedBatch, {
  //       headers: {
  //         'Content-Encoding': 'gzip',
  //         'Content-Type': 'application/json',
  //       },
  //     });
  //   }
  // }

  // sendBatchesSimultaneously = async (
  //   payload: any,
  //   batchSize = 300,
  //   concurrency = 5
  // ) => {
  //   const totalBatches = Math.ceil(payload.length / batchSize);

  //   // Create a function to send a batch
  //   // const sendBatch = async (batch: any) => {
  //   //   const compressedBatch = pako.gzip(JSON.stringify(batch));
  //   //   return axios.post('/your-endpoint', compressedBatch, {
  //   //     headers: {
  //   //       'Content-Encoding': 'gzip',
  //   //       'Content-Type': 'application/json',
  //   //     },
  //   //   });

  //   // this.subs.sink = this.dataUsageService
  //   // .uploadDataUsage(
  //   //     this.uploadForm.value.company_id,
  //   //     this.uploadForm.value.provider_id,
  //   //     this.uploadForm.value.period
  //   //         ? moment(this.uploadForm.value.period).format(
  //   //               'YYYYMM'
  //   //           )
  //   //         : '',
  //   //     compressedBatch
  //   // )
  //   // };

  //   // Generate batches
  //   const batches: any = [];
  //   for (let i = 0; i < totalBatches; i++) {
  //     const batch = payload.slice(i * batchSize, (i + 1) * batchSize);
  //     batches.push(batch);
  //   }

  //   // Function to process batches with concurrency control
  //   const processBatches = async () => {
  //     let index = 0;
  //     const results = [];
  //     while (index < batches.length) {
  //       // Create a batch of promises with a limit on concurrency
  //       const batchPromises = [];
  //       for (let i = 0; i < concurrency && index < batches.length; i++) {
  //         batchPromises.push(sendBatch(batches[index++]));
  //       }
  //       // Wait for the batch of promises to complete
  //       results.push(...(await Promise.all(batchPromises)));
  //     }
  //     return results;
  //   };

  //   try {
  //     const results = await processBatches();
  //     console.log('All batches sent successfully', results);
  //   } catch (error) {
  //     console.error('Error sending batches', error);
  //   }
  // };

  async sendBatchesAndSummarize(payload: any[]) {
    const batchSize = 100;
    const concurrency = 5;
    const totalBatches = Math.ceil(payload.length / batchSize);

    const batches: any = [];
    for (let i = 0; i < totalBatches; i++) {
      const batch = payload.slice(i * batchSize, (i + 1) * batchSize);
      batches.push(batch);
    }

    const sendBatch = async (batch: any[]) => {
      return await this.uploadDataUsage1(batch);
    };

    const processBatches = async () => {
      let index = 0;
      const results = [];
      while (index < batches.length) {
        const batchPromises = [];
        for (let i = 0; i < concurrency && index < batches.length; i++) {
          batchPromises.push(sendBatch(batches[index++]));
        }
        results.push(...(await Promise.all(batchPromises)));
      }
      return results;
    };

    try {
      await processBatches();
      console.log('All batches sent successfully');
      const summary = await this.summarize();
      console.log('Summary:', summary);
    } catch (error) {
      console.error('Error sending batches or summarizing data', error);
    }
  }

  private urlPath = 'https://consumer.computradetech.com:3000/api/';

  uploadDataUsage1(data: any) {
    return new Promise<Uint8Array>((resolve, reject) => {
      gzip(
        new TextEncoder().encode(JSON.stringify(data)),
        (err, compressedData) => {
          if (err) {
            reject(err);
          } else {
            resolve(compressedData);
          }
        }
      );
    }).then((compressedData: Uint8Array) => {
      const headers = new HttpHeaders({
        'Content-Encoding': 'gzip',
        'Content-Type': 'application/json',
      });

      return this.http
        .post<any>(
          `${this.urlPath}data-usage/uploadDataUsage1`,
          compressedData.buffer, // Send the buffer directly
          { headers }
        )
        .pipe(map((res) => res))
        .toPromise();
    });
  }

  summarize() {
    return this.http
      .get<any>(`${this.urlPath}data-usage/summarize`)
      .toPromise();
  }
}
