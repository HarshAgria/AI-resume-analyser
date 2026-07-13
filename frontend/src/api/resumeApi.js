import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const FRIENDLY_ERROR_MESSAGES = {
  OCR_FAILURE: 'We could not read text from this scan. Please upload a searchable PDF or a clearer scan.',
  OCR_TIMEOUT: 'OCR took too long for this file. Please try a cleaner or smaller PDF.',
  WEAK_TEXT_EXTRACTION: 'Text extraction quality is too low. Upload a clearer, text-based PDF for better accuracy.',
  UNSUPPORTED_FILE_TYPE: 'Unsupported file format. Please upload a PDF resume.',
  CORRUPTED_OR_INVALID_FILE: 'This file appears corrupted or is not a valid PDF.',
  TOKEN_LIMIT_EXCEEDED: 'Your resume is too long for one AI pass. Try a shorter version or remove repeated sections.',
  AI_TIMEOUT: 'The analysis request timed out. Please try again in a few moments.',
  AI_RATE_LIMITED: 'The AI service is currently busy. Please retry shortly.',
  RATE_LIMITED: 'Too many requests from this network. Please wait a few minutes before retrying.',
  INTERNAL_SERVER_ERROR: 'Server error while analyzing your resume. Please try again.',
};

const normalizeApiError = (err) => {
  const responseError = err?.response?.data?.error;
  const code = responseError?.code;

  if (code && FRIENDLY_ERROR_MESSAGES[code]) {
    return new Error(FRIENDLY_ERROR_MESSAGES[code]);
  }

  if (responseError?.userMessage) {
    return new Error(responseError.userMessage);
  }

  if (responseError?.message) {
    return new Error(responseError.message);
  }

  return new Error(err?.message || 'Analysis failed due to a network or server issue.');
};

export const analyzeResume = async (file, role = "") => {
  const formData = new FormData();
  formData.append('resume', file);
  if (role) formData.append('role', role);

  try {
    const response = await axios.post(`${API_URL}/api/analyze`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });

    return response.data;
  } catch (err) {
    throw normalizeApiError(err);
  }
};

export const deleteUploadedFile = async (fileUrl, publicId = "") => {
  try {
    const response = await axios.post(`${API_URL}/api/analyze/delete`, { fileUrl, publicId });
    return response.data;
  } catch (err) {
    throw normalizeApiError(err);
  }
};