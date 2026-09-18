import axios from "axios";

const API_URL =
  import.meta.env.VITE_API_URL?.replace(/\/$/, "") || "http://localhost:3000";

const FRIENDLY_ERROR_MESSAGES = {
  OCR_FAILURE:
    "We could not read text from this scan. Please upload a searchable PDF or a clearer scan.",

  OCR_TIMEOUT:
    "OCR took too long for this file. Please try a cleaner or smaller PDF.",

  WEAK_TEXT_EXTRACTION:
    "Text extraction quality is too low. Upload a clearer, text-based PDF for better accuracy.",

  EXTRACTION_FAILED:
    "We could not extract readable text from this PDF. Please upload a searchable or text-based PDF.",

  NOT_A_RESUME:
    "The uploaded file does not appear to be a resume. Please upload a valid resume document.",

  UNSUPPORTED_FILE_TYPE: "Unsupported file format. Please upload a PDF resume.",

  CORRUPTED_OR_INVALID_FILE:
    "This file appears corrupted or is not a valid PDF.",

  FILE_TOO_LARGE: "File too large. Please upload a PDF under 5MB.",

  MISSING_FILE: "Please upload a PDF resume to continue.",

  TOKEN_LIMIT_EXCEEDED:
    "Your resume is too long for one AI pass. Try a shorter version or remove repeated sections.",

  AI_TIMEOUT:
    "The analysis request timed out. Please try again in a few moments.",

  AI_RATE_LIMITED: "The AI service is currently busy. Please retry shortly.",

  RATE_LIMITED:
    "Too many requests from this network. Please wait a few minutes before retrying.",

  MCP_TOOL_FAILED:
    "The job-description matching service could not complete the request. Please try again.",
  MCP_RESPONSE_INVALID:
    "The job-description matching service returned an invalid response. Please try again.",

  INTERNAL_SERVER_ERROR:
    "Server error while analyzing your resume. Please try again.",

  MISSING_FILE_REFERENCE: "No uploaded file reference was provided.",

  INVALID_FILE_REFERENCE: "The uploaded file reference is invalid.",
};

const normalizeApiError = (err) => {
  const responseData = err?.response?.data;
  const responseError = responseData?.error;
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

  if (responseData?.message) {
    return new Error(responseData.message);
  }

  if (err?.code === "ECONNABORTED") {
    return new Error("The server took too long to respond. Please try again.");
  }
  if (!err?.response) {
    return new Error(
      "Could not connect to the analysis server. Please check your connection and try again.",
    );
  }

  return new Error(
    err?.message || "Analysis failed due to a network or server issue.",
  );
};

export const analyzeResume = async (file, role = "", jobDescription = "") => {
  if (!file) {
    throw new Error(FRIENDLY_ERROR_MESSAGES.MISSING_FILE);
  }
  const formData = new FormData();

  formData.append("resume", file);

  const trimmedRole = String(role || "").trim();
  const trimmedJobDescription = String(jobDescription || "").trim();

  if (trimmedRole) {
    formData.append("targetRole", trimmedRole);
  }

  if (trimmedJobDescription) {
    formData.append("jobDescription", trimmedJobDescription);
  }

  try {
    const response = await axios.post(`${API_URL}/api/analyze`, formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },

      // Resume analysis can involve PDF extraction + AI + RAG.
      timeout: 120000,
    });

    const data = response?.data;
    if (!data?.success) {
      throw new Error(
        data?.error?.userMessage ||
          data?.error?.message ||
          data?.message ||
          "Resume analysis failed.",
      );
    }
    if (!data?.analysis) {
      throw new Error(
        "The server completed the request but returned no analysis.",
      );
    }
    return data;
  } catch (err) {
    throw normalizeApiError(err);
  }
};

export const deleteUploadedFile = async (fileUrl, publicId = "") => {
  if (!fileUrl && !publicId) {
    throw new Error(FRIENDLY_ERROR_MESSAGES.MISSING_FILE_REFERENCE);
  }

  try {
    const response = await axios.post(
      `${API_URL}/api/analyze/delete`,
      {
        fileUrl,
        publicId,
      },
      {
        timeout: 30000,
      },
    );

    const data = response?.data;
    if (!data?.success) {
      throw new Error(
        data?.error?.userMessage ||
          data?.error?.message ||
          data?.message ||
          "Could not delete the uploaded file.",
      );
    }
    return data;
  } catch (err) {
    throw normalizeApiError(err);
  }
};