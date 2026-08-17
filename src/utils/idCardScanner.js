/**
 * idCardScanner.js
 *
 * Client-side OCR using Tesseract.js for HPSEBL Departmental ID cards,
 * Aadhaar, PAN, Voter ID, and Driving Licence.
 *
 * Pre-processes the image for higher OCR accuracy, then runs smart
 * regex parsers to extract relevant identity fields.
 */
import Tesseract from 'tesseract.js';

// =============================================
// IMAGE PRE-PROCESSING (Canvas-based)
// =============================================

/**
 * Preprocesses an image for better OCR accuracy.
 * Converts to grayscale and boosts contrast.
 * @param {File|string} source - Image file or URL
 * @returns {Promise<string>} - base64 canvas data URL
 */
export const preprocessImage = (source) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';

    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');

      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      // Grayscale + contrast boost (factor 1.5)
      const contrast = 1.5;
      const intercept = 128 * (1 - contrast);
      for (let i = 0; i < data.length; i += 4) {
        const avg = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        const adjusted = Math.min(255, Math.max(0, contrast * avg + intercept));
        data[i] = data[i + 1] = data[i + 2] = adjusted;
      }
      ctx.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };

    img.onerror = reject;

    if (source instanceof File) {
      img.src = URL.createObjectURL(source);
    } else {
      img.src = source;
    }
  });
};

// =============================================
// OCR RUNNER
// =============================================

/**
 * Runs Tesseract OCR on the image and returns raw extracted text.
 * @param {string} imageDataUrl - preprocessed image as base64
 * @param {Function} onProgress - progress callback (0-100)
 * @returns {Promise<string>} - extracted text
 */
export const runOCR = async (imageDataUrl, onProgress) => {
  const result = await Tesseract.recognize(imageDataUrl, 'eng+hin', {
    logger: (m) => {
      if (m.status === 'recognizing text' && onProgress) {
        onProgress(Math.round(m.progress * 100));
      }
    },
  });
  return result.data.text;
};

// =============================================
// SMART FIELD PARSERS
// =============================================

/** Extract Aadhaar number: 12 digits grouped as XXXX XXXX XXXX */
const parseAadhaar = (text) => {
  const match = text.match(/\b\d{4}\s?\d{4}\s?\d{4}\b/);
  return match ? match[0].replace(/\s/g, ' ') : '';
};

/** Extract PAN: 10-char alphanumeric AAAA9999A format */
const parsePAN = (text) => {
  const match = text.match(/\b[A-Z]{5}[0-9]{4}[A-Z]\b/);
  return match ? match[0] : '';
};

/** Extract Voter ID: starts with 2-3 uppercase letters + digits */
const parseVoterID = (text) => {
  const match = text.match(/\b[A-Z]{2,3}\/?\d{6,8}\b/);
  return match ? match[0] : '';
};

/** Extract DOB: supports DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY, Year of Birth: YYYY */
const parseDOB = (text) => {
  const match = text.match(/\b(\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4}|\d{4})\b/);
  return match ? match[0] : '';
};

/** Extract Gender */
const parseGender = (text) => {
  const upper = text.toUpperCase();
  if (upper.includes('FEMALE') || upper.includes('MAHILA') || upper.includes('STR\u012b')) return 'Female';
  if (upper.includes('MALE') || upper.includes('PURUSH') || upper.includes('V\u012aRA')) return 'Male';
  return '';
};

/** Extract Name - looks for "Name:" / "नाम" labels or all-caps line */
const parseName = (text) => {
  // Try labeled "Name:" pattern
  const labeledMatch = text.match(/(?:Name|नाम|NAME)\s*[:\-]?\s*([A-Z][A-Za-z\s]{3,40})/);
  if (labeledMatch) return labeledMatch[1].trim();

  // Try second or third all-caps line (usually the name on Aadhaar/PAN)
  const capsLines = text.split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 3 && /^[A-Z\s]+$/.test(l) && !/\d/.test(l));
  return capsLines.length > 0 ? capsLines[0] : '';
};

/** Extract Father's Name */
const parseFatherName = (text) => {
  const match = text.match(/(?:Father|S\/O|W\/O|C\/O|पिता|Son of|Wife of)\s*[:\-]?\s*([A-Z][A-Za-z\s\.]{3,40})/i);
  return match ? match[1].trim() : '';
};

/** Extract Aadhaar address */
const parseAddress = (text) => {
  const match = text.match(/(?:Address|पता|Addr)\s*[:\-]?\s*([\s\S]{10,120}?)(?:\n\n|\d{6}|$)/i);
  if (match) return match[1].replace(/\n/g, ', ').trim();
  // Extract PIN code as fallback address clue
  const pinMatch = text.match(/\b\d{6}\b/);
  return pinMatch ? `PIN: ${pinMatch[0]}` : '';
};

/** Extract Employee / Vendor Number (HPSEBL Departmental ID) */
const parseEmployeeNo = (text) => {
  // HPSEBL vendor numbers: typically 5-digit numbers
  const vendorMatch = text.match(/(?:Vendor|Employee|Emp|CPF|ID|No)[.\s]*[:\-]?\s*(\d{5,8})/i);
  if (vendorMatch) return vendorMatch[1];
  // Fallback: look for 5-digit standalone number
  const standalone = text.match(/\b\d{5}\b/);
  return standalone ? standalone[0] : '';
};

/** Extract Designation (HPSEBL departmental ID) */
const parseDesignation = (text) => {
  const known = [
    'Junior Engineer', 'JE', 'Assistant Engineer', 'AE', 'Executive Engineer',
    'XEN', 'SDO', 'Sub Divisional Officer', 'Foreman', 'Technician', 'Helper',
    'Line Man', 'Lineman', 'ALM', 'Clerk', 'Accountant', 'Store Keeper',
    'Operator', 'Driver', 'Peon', 'Section Officer',
  ];
  const upper = text.toUpperCase();
  for (const d of known) {
    if (upper.includes(d.toUpperCase())) return d;
  }
  // Generic label-based
  const match = text.match(/(?:Designation|Post|Desgn)[.:\s]*([A-Za-z\s\.\/]{4,40})/i);
  return match ? match[1].trim() : '';
};

/** Extract Blood Group */
const parseBloodGroup = (text) => {
  const match = text.match(/\b(A|B|AB|O)[+-]\b/i);
  return match ? match[0].toUpperCase() : '';
};

/** Extract Circle / Division (HPSEBL) */
const parseCircle = (text) => {
  const match = text.match(/(?:Circle|CKL)[:\s]*([A-Za-z\s]+?)(?:\n|Division|$)/i);
  return match ? match[1].trim() : '';
};

const parseDivision = (text) => {
  const match = text.match(/(?:Division|Div)[:\s]*([A-Za-z\s]+?)(?:\n|Sub|$)/i);
  return match ? match[1].trim() : '';
};

// =============================================
// DETECT CARD TYPE
// =============================================

export const detectCardType = (text) => {
  const upper = text.toUpperCase();
  if (upper.includes('AADHAAR') || upper.includes('UNIQUE IDENTIFICATION') || upper.includes('UIDAI')) return 'AADHAAR';
  if (upper.includes('INCOME TAX') || upper.includes('PERMANENT ACCOUNT')) return 'PAN';
  if (upper.includes('ELECTION COMMISSION') || upper.includes('VOTER') || upper.includes('ELECTORS')) return 'VOTER_ID';
  if (upper.includes('DRIVING') || upper.includes('LICENCE')) return 'DRIVING_LICENCE';
  if (upper.includes('HPSEBL') || upper.includes('HIMACHAL PRADESH STATE ELECTRICITY') || upper.includes('CPF') || upper.includes('EMPLOYEE')) return 'HPSEBL_DEPT';
  return 'UNKNOWN';
};

// =============================================
// MAIN PARSER: Extract all fields from OCR text
// =============================================

/**
 * Extracts all relevant identity fields from raw OCR text.
 * Returns an object mapping to UserProfile form fields.
 *
 * @param {string} rawText - Raw OCR extracted text
 * @returns {Object} Extracted fields
 */
export const parseIDCard = (rawText) => {
  const cardType = detectCardType(rawText);
  const extracted = {
    cardType,
    name: parseName(rawText),
    fatherName: parseFatherName(rawText),
    dob: parseDOB(rawText),
    gender: parseGender(rawText),
    address: parseAddress(rawText),
    aadhaarNo: cardType === 'AADHAAR' ? parseAadhaar(rawText) : '',
    panNo: cardType === 'PAN' ? parsePAN(rawText) : '',
    voterIdNo: cardType === 'VOTER_ID' ? parseVoterID(rawText) : '',
    employeeNo: cardType === 'HPSEBL_DEPT' ? parseEmployeeNo(rawText) : '',
    designation: parseDesignation(rawText),
    bloodGroup: parseBloodGroup(rawText),
    circle: parseCircle(rawText),
    division: parseDivision(rawText),
    rawText,
  };
  return extracted;
};

// =============================================
// FULL SCAN PIPELINE
// =============================================

/**
 * Full pipeline: preprocess → OCR → parse → return extracted fields.
 * @param {File} imageFile - The uploaded or captured image
 * @param {Function} onProgress - progress callback (0-100)
 * @returns {Promise<Object>} Extracted identity fields
 */
export const scanIDCard = async (imageFile, onProgress) => {
  if (onProgress) onProgress(5);
  const processedImage = await preprocessImage(imageFile);
  if (onProgress) onProgress(15);
  const rawText = await runOCR(processedImage, (pct) => {
    if (onProgress) onProgress(15 + Math.round(pct * 0.8)); // 15–95%
  });
  if (onProgress) onProgress(98);
  const parsed = parseIDCard(rawText);
  if (onProgress) onProgress(100);
  return { ...parsed, processedImage };
};
