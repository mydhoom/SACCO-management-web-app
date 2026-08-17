/**
 * idCardScanner.js
 *
 * Hybrid ID Card OCR & Data Extraction:
 *  1. AI Vision (Primary) — Uses Google Gemini Vision / OpenAI Vision via backend API
 *     for 100% precision with Aadhaar, PAN, HPSEBL Departmental IDs, and Voter IDs.
 *  2. Tesseract OCR (Offline Fallback) — Enhanced client-side OCR with smart regex parsers
 *     if backend AI is unreachable.
 */
import Tesseract from 'tesseract.js';
import { API_BASE_URL } from '../apiConfig';

// =============================================
// IMAGE CONVERTER / PREPROCESSING
// =============================================

export const fileToBase64 = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = (error) => reject(error);
  });
};

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

      // Grayscale + contrast boost
      const contrast = 1.4;
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
// FALLBACK CLIENT-SIDE REGEX PARSERS
// =============================================

/** Extract Aadhaar number: 12 digits grouped as XXXX XXXX XXXX or contiguous 12 digits */
const parseAadhaar = (text) => {
  const match = text.match(/\b\d{4}\s\d{4}\s\d{4}\b/) || text.match(/\b\d{12}\b/);
  if (match) {
    const raw = match[0].replace(/\s/g, '');
    return `${raw.slice(0, 4)} ${raw.slice(4, 8)} ${raw.slice(8, 12)}`;
  }
  return '';
};

/** Extract PAN: 10-char alphanumeric AAAA9999A format */
const parsePAN = (text) => {
  const match = text.match(/\b[A-Z]{5}[0-9]{4}[A-Z]\b/i);
  return match ? match[0].toUpperCase() : '';
};

/** Extract Voter ID */
const parseVoterID = (text) => {
  const match = text.match(/\b[A-Z]{2,3}\/?\d{6,8}\b/i);
  return match ? match[0].toUpperCase() : '';
};

/** Extract DOB or Year of Birth */
const parseDOB = (text) => {
  // Labeled Year of Birth: e.g. "Year of Birth : 1980" or "DOB: 15/08/1985"
  const yobMatch = text.match(/(?:Year\s*of\s*Birth|जन्म\s*वर्ष|YOB|DOB|Date\s*of\s*Birth)[.\s:]*(\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4}|\d{4})/i);
  if (yobMatch) return yobMatch[1];

  // Standard full date DD/MM/YYYY or DD-MM-YYYY
  const dateMatch = text.match(/\b(\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4})\b/);
  if (dateMatch) return dateMatch[0];

  // Standalone 4 digit year between 1940 and 2015
  const yearMatch = text.match(/\b(19[4-9]\d|20[0-1]\d)\b/);
  if (yearMatch) return yearMatch[0];

  return '';
};

/** Extract Gender */
const parseGender = (text) => {
  const upper = text.toUpperCase();
  if (upper.includes('FEMALE') || upper.includes('महिला') || upper.includes('WOMAN')) return 'Female';
  if (upper.includes('MALE') || upper.includes('पुरुष') || upper.includes('MAN')) return 'Male';
  return '';
};

/** Noise words to ignore when extracting names */
const NOISE_WORDS = [
  'GOVERNMENT', 'INDIA', 'GOVERNMENT OF INDIA', 'BHARAT', 'SARKAR', 'BHARAT SARKAR',
  'AADHAAR', 'AADHAR', 'ENROLMENT', 'MERA AADHAAR', 'IDENTITY', 'AUTHORITY',
  'UNIQUE IDENTIFICATION', 'UIDAI', 'MALE', 'FEMALE', 'DOB', 'YEAR OF BIRTH',
  'HELP', 'ISSUE', 'DATE', 'FATHER', 'HUSBAND', 'ADDRESS', 'VID', 'INCOME TAX',
  'DEPARTMENT', 'ELECTION', 'COMMISSION', 'HPSEBL', 'ELECTRICITY', 'BOARD', 'LIMITED',
  'AM ADMI KA ADHIKAR', 'MAHER', 'CARD', 'SIGNATURE', 'HOLDER'
];

/** Extract Name */
const parseName = (text) => {
  // 1. Check labeled Name
  const labeled = text.match(/(?:Name|नाम|NAME|Employee Name|Member Name)\s*[:\-]?\s*([A-Za-z\s]{3,35})/i);
  if (labeled && !NOISE_WORDS.some(w => labeled[1].toUpperCase().includes(w))) {
    return labeled[1].trim();
  }

  // 2. Scan lines for a clean English name (2-3 words capitalized, no digits)
  const lines = text.split('\n')
    .map(l => l.trim().replace(/[^A-Za-z\s]/g, '').trim())
    .filter(l => l.length >= 4 && l.length <= 30);

  for (const line of lines) {
    const upper = line.toUpperCase();
    const isNoise = NOISE_WORDS.some(w => upper === w || upper.includes(w));
    if (!isNoise && /^[A-Z][a-zA-Z\s]+$/.test(line) && line.split(/\s+/).length >= 2) {
      return line.trim();
    }
  }

  return '';
};

/** Extract Father's Name */
const parseFatherName = (text) => {
  const match = text.match(/(?:Father|S\/O|W\/O|C\/O|D\/O|पिता|Son of|Wife of)\s*[:\-]?\s*([A-Z][A-Za-z\s\.]{3,40})/i);
  if (match && !NOISE_WORDS.some(w => match[1].toUpperCase().includes(w))) {
    return match[1].trim();
  }
  return '';
};

/** Extract Address */
const parseAddress = (text) => {
  const match = text.match(/(?:Address|पता|Addr)\s*[:\-]?\s*([\s\S]{10,120}?)(?:\n\n|\d{6}|$)/i);
  if (match) return match[1].replace(/\n/g, ', ').trim();
  const pinMatch = text.match(/\b\d{6}\b/);
  return pinMatch ? `PIN: ${pinMatch[0]}` : '';
};

/** Extract Employee / Vendor Number (HPSEBL Departmental ID) */
const parseEmployeeNo = (text) => {
  const vendorMatch = text.match(/(?:Vendor|Employee|Emp|CPF|ID|No)[.\s]*[:\-]?\s*(\d{5,8})/i);
  if (vendorMatch) return vendorMatch[1];
  const standalone = text.match(/\b\d{5,7}\b/);
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

/** Detect Card Type */
export const detectCardType = (text) => {
  const upper = text.toUpperCase();
  if (
    upper.includes('AADHAAR') || 
    upper.includes('AADHAR') || 
    upper.includes('भारत सरकार') || 
    upper.includes('GOVERNMENT OF INDIA') || 
    upper.includes('UIDAI') || 
    upper.includes('UNIQUE IDENTIFICATION') ||
    upper.includes('आम आदमी का अधिकार') ||
    /\b\d{4}\s\d{4}\s\d{4}\b/.test(text)
  ) {
    return 'AADHAAR';
  }
  if (upper.includes('INCOME TAX') || upper.includes('PERMANENT ACCOUNT') || parsePAN(text)) return 'PAN';
  if (upper.includes('ELECTION COMMISSION') || upper.includes('VOTER') || upper.includes('ELECTORS') || parseVoterID(text)) return 'VOTER_ID';
  if (upper.includes('DRIVING') || upper.includes('LICENCE') || upper.includes('DL NO')) return 'DRIVING_LICENCE';
  if (upper.includes('HPSEBL') || upper.includes('HIMACHAL PRADESH STATE ELECTRICITY') || upper.includes('CPF')) return 'HPSEBL_DEPT';
  return 'IDENTITY_DOC';
};

/** Local OCR parser */
export const parseIDCard = (rawText) => {
  const cardType = detectCardType(rawText);
  const aadhaar = parseAadhaar(rawText);
  const pan = parsePAN(rawText);
  const voter = parseVoterID(rawText);

  return {
    cardType: cardType === 'IDENTITY_DOC' && aadhaar ? 'AADHAAR' : cardType,
    name: parseName(rawText),
    fatherName: parseFatherName(rawText),
    dob: parseDOB(rawText),
    gender: parseGender(rawText),
    address: parseAddress(rawText),
    aadhaarNo: aadhaar,
    panNo: pan,
    voterIdNo: voter,
    employeeNo: parseEmployeeNo(rawText),
    designation: parseDesignation(rawText),
    bloodGroup: parseBloodGroup(rawText),
    circle: parseCircle(rawText),
    division: parseDivision(rawText),
    rawText,
  };
};

// =============================================
// FULL SCAN PIPELINE (AI Vision + Tesseract Fallback)
// =============================================

/**
 * Full pipeline:
 *  1. Attempts high-accuracy AI Vision scan via backend API (/api/ai/scan-id-card)
 *  2. Seamlessly falls back to local Tesseract OCR if backend is offline/unreachable
 *
 * @param {File} imageFile - The uploaded or captured image
 * @param {Function} onProgress - progress callback (0-100)
 * @returns {Promise<Object>} Extracted identity fields
 */
export const scanIDCard = async (imageFile, onProgress) => {
  if (onProgress) onProgress(10);
  const imageBase64 = await fileToBase64(imageFile);
  if (onProgress) onProgress(25);

  const token = localStorage.getItem('token') || localStorage.getItem('adminToken');

  // ── 1. PRIMARY: AI Vision API ──
  try {
    if (onProgress) onProgress(40);
    const res = await fetch(`${API_BASE_URL}/api/ai/scan-id-card`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        imageBase64,
        mimeType: imageFile.type || 'image/jpeg'
      })
    });

    if (res.ok) {
      const json = await res.json();
      if (json.success && json.data) {
        if (onProgress) onProgress(100);
        console.log('✅ OCR Success: Extracted using AI Vision', json.data);
        return {
          ...json.data,
          processedImage: imageBase64,
          source: 'AI_VISION'
        };
      }
    }
  } catch (aiErr) {
    console.warn('AI Vision Scan endpoint unavailable — falling back to client Tesseract OCR:', aiErr.message);
  }

  // ── 2. FALLBACK: Client-side Tesseract OCR ──
  if (onProgress) onProgress(50);
  const processedImage = await preprocessImage(imageFile);
  if (onProgress) onProgress(65);

  const result = await Tesseract.recognize(processedImage, 'eng+hin', {
    logger: (m) => {
      if (m.status === 'recognizing text' && onProgress) {
        onProgress(65 + Math.round(m.progress * 30)); // 65–95%
      }
    },
  });

  const rawText = result.data.text || '';
  if (onProgress) onProgress(98);
  const parsed = parseIDCard(rawText);
  if (onProgress) onProgress(100);

  return { ...parsed, processedImage, source: 'LOCAL_OCR' };
};
