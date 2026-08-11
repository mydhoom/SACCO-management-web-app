const XLSX = require('xlsx');

try {
  const filePath = 'E:\\Mahadev Society Frontend\\Pen Drive\\New Revised loan ledger 24-25.xlsx';
  console.log(`Reading file: ${filePath}`);
  
  // Read file, extracting formulas as well
  const workbook = XLSX.readFile(filePath, { cellFormula: true });
  
  console.log(`\nFound ${workbook.SheetNames.length} sheets: ${workbook.SheetNames.join(', ')}`);
  
  for (const sheetName of workbook.SheetNames) {
    console.log(`\n--- SHEET: ${sheetName} ---`);
    const worksheet = workbook.Sheets[sheetName];
    
    // Get the range
    const range = XLSX.utils.decode_range(worksheet['!ref']);
    
    // Print first few rows to understand the structure
    console.log(`Dimensions: Rows 0 to ${range.e.r}, Columns 0 to ${range.e.c}`);
    
    for (let r = 0; r <= Math.min(range.e.r, 5); r++) {
      let rowData = [];
      for (let c = 0; c <= range.e.c; c++) {
        const cellAddress = XLSX.utils.encode_cell({r, c});
        const cell = worksheet[cellAddress];
        if (cell) {
          let val = cell.v !== undefined ? cell.v : '';
          // If it has a formula, show it
          if (cell.f) {
            val = `${val} [FORMULA: =${cell.f}]`;
          }
          rowData.push(val);
        } else {
          rowData.push('');
        }
      }
      // only print row if not completely empty
      if (rowData.some(val => val !== '')) {
         console.log(`Row ${r+1}:`, rowData.join(' | '));
      }
    }
  }
} catch (error) {
  console.error('Error reading Excel file:', error);
}
