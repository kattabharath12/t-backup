
"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { FileUpload, FileUploadProgress } from "@/components/ui/file-upload"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { FileText, Eye, Download, Upload, CheckCircle, AlertCircle, X, Plus, Clock, AlertTriangle } from "lucide-react"
import { DuplicateWarningDialog } from "@/components/duplicate-warning-dialog"

interface DocumentProcessorProps {
  taxReturnId: string
  onDocumentProcessed: (extractedData: any) => void
  onDocumentUploaded?: (document: any) => void
  onUploadMoreRequested?: () => void
}

interface ProcessingState {
  files: File[]
  processedDocuments: ProcessedDocument[]
  currentlyProcessing: number | null
  progress: number
  status: 'idle' | 'uploading' | 'processing' | 'completed' | 'error'
  message: string
}

interface ProcessedDocument {
  file: File
  document: any | null
  extractedData: any | null
  status: 'pending' | 'uploading' | 'processing' | 'completed' | 'error' | 'duplicate_warning'
  message: string
  progress: number
  duplicateDetection?: any
}

export function DocumentProcessor({ 
  taxReturnId, 
  onDocumentProcessed, 
  onDocumentUploaded,
  onUploadMoreRequested
}: DocumentProcessorProps) {
  const [state, setState] = useState<ProcessingState>({
    files: [],
    processedDocuments: [],
    currentlyProcessing: null,
    progress: 0,
    status: 'idle',
    message: ''
  })

  const [duplicateWarning, setDuplicateWarning] = useState<{
    open: boolean;
    documentIndex: number | null;
    documentData: any;
  }>({
    open: false,
    documentIndex: null,
    documentData: null
  })

  const handleDuplicateAction = async (action: 'proceed' | 'cancel' | 'replace', replacementDocumentId?: string) => {
    if (duplicateWarning.documentIndex === null || !duplicateWarning.documentData) return;

    const index = duplicateWarning.documentIndex;
    const document = duplicateWarning.documentData.document;

    const updateDocumentState = (updates: Partial<ProcessedDocument>) => {
      setState(prev => ({
        ...prev,
        processedDocuments: prev.processedDocuments.map((doc, i) => 
          i === index ? { ...doc, ...updates } : doc
        )
      }))
    }

    try {
      updateDocumentState({ 
        status: 'processing', 
        message: 'Processing duplicate action...' 
      })

      const response = await fetch(`/api/documents/${document.id}/duplicate-action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action,
          replacementDocumentId
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(errorData.error || 'Failed to process duplicate action')
      }

      const result = await response.json()
      
      if (action === 'cancel') {
        updateDocumentState({
          status: 'error',
          message: 'Import cancelled due to duplicate warning'
        })
      } else {
        // For 'proceed' or 'replace', complete the document processing
        updateDocumentState({
          status: 'completed',
          progress: 100,
          message: action === 'replace' ? 'Document replaced successfully' : 'Document imported despite duplicate warning',
          extractedData: duplicateWarning.documentData.extractedData
        })
        onDocumentProcessed(duplicateWarning.documentData.extractedData)
      }

      // Close the dialog
      setDuplicateWarning({
        open: false,
        documentIndex: null,
        documentData: null
      })

    } catch (error) {
      console.error('Error handling duplicate action:', error)
      updateDocumentState({
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to process duplicate action'
      })
    }
  }

  const handleFileSelect = (file: File) => {
    setState(prev => ({
      ...prev,
      files: [...prev.files, file],
      status: 'idle',
      message: 'Files selected for upload'
    }))
  }

  const handleFileRemove = (index?: number) => {
    if (index !== undefined) {
      // Remove specific file
      setState(prev => ({
        ...prev,
        files: prev.files.filter((_, i) => i !== index)
      }))
    } else {
      // Remove all files
      setState(prev => ({
        ...prev,
        files: [],
        processedDocuments: [],
        currentlyProcessing: null,
        status: 'idle',
        message: ''
      }))
    }
  }

  const handleRemoveProcessedDocument = (index: number) => {
    setState(prev => ({
      ...prev,
      processedDocuments: prev.processedDocuments.filter((_, i) => i !== index)
    }))
  }

  const processAllDocuments = async () => {
    if (state.files.length === 0) return

    setState(prev => ({ ...prev, status: 'processing', message: 'Starting document processing...' }))

    // Initialize processed documents array
    const initialProcessedDocs: ProcessedDocument[] = state.files.map(file => ({
      file,
      document: null,
      extractedData: null,
      status: 'pending',
      message: 'Waiting to process...',
      progress: 0
    }))

    setState(prev => ({ 
      ...prev, 
      processedDocuments: initialProcessedDocs,
      files: [] // Clear the pending files queue
    }))

    // Process documents one by one
    for (let i = 0; i < initialProcessedDocs.length; i++) {
      await processSingleDocument(i, initialProcessedDocs[i].file)
    }

    setState(prev => ({ 
      ...prev, 
      status: 'completed',
      currentlyProcessing: null,
      message: 'All documents processed successfully!'
    }))
  }

  const processSingleDocument = async (index: number, file: File) => {
    setState(prev => ({ 
      ...prev, 
      currentlyProcessing: index,
      message: `Processing document ${index + 1} of ${prev.processedDocuments.length}...`
    }))

    const updateDocumentState = (updates: Partial<ProcessedDocument>) => {
      setState(prev => ({
        ...prev,
        processedDocuments: prev.processedDocuments.map((doc, i) => 
          i === index ? { ...doc, ...updates } : doc
        )
      }))
    }

    try {

      // Upload phase
      updateDocumentState({ 
        status: 'uploading', 
        message: 'Uploading document...', 
        progress: 10 
      })

      const formData = new FormData()
      formData.append('file', file)
      formData.append('taxReturnId', taxReturnId)

      updateDocumentState({ progress: 30, message: 'Uploading to server...' })

      const uploadResponse = await fetch(`/api/documents/upload`, {
        method: 'POST',
        body: formData
      })

      if (!uploadResponse.ok) {
        const errorData = await uploadResponse.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(`Failed to upload document: ${errorData.error || 'Server error'}`)
      }

      const document = await uploadResponse.json()
      updateDocumentState({ 
        document, 
        status: 'processing',
        progress: 50,
        message: 'Extracting data from document...'
      })

      onDocumentUploaded?.(document)

      // Processing phase - Use direct API call instead of streaming for better reliability
      const processResponse = await fetch(`/api/documents/${document.id}/process`, {
        method: 'POST'
      })

      if (!processResponse.ok) {
        throw new Error('Failed to process document')
      }

      // Check if response is streaming or direct JSON
      const contentType = processResponse.headers.get('content-type')
      
      if (contentType?.includes('application/json')) {
        // Direct JSON response - processing completed immediately
        const result = await processResponse.json()
        
        if (result.success) {
          // Check for duplicate detection
          if (result.data?.duplicateInfo?.isDuplicate) {
            console.log('🔍 [DUPLICATE] Duplicate detected for document:', file.name)
            updateDocumentState({
              status: 'duplicate_warning',
              progress: 100,
              message: 'Potential duplicate detected - user action required',
              extractedData: result.data,
              duplicateDetection: result.data.duplicateInfo
            })
            
            // Show duplicate warning dialog
            setDuplicateWarning({
              open: true,
              documentIndex: index,
              documentData: {
                file,
                document,
                extractedData: result.data
              }
            })
          } else {
            // No duplicates, complete normally
            updateDocumentState({
              status: 'completed',
              progress: 100,
              message: 'Document processed successfully',
              extractedData: result.data
            })
            onDocumentProcessed(result.data)
          }
        } else {
          throw new Error(result.error || 'Processing failed')
        }
      } else {
        // Streaming response - handle as before but with better error handling
        const reader = processResponse.body?.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let currentProgress = 50

        while (reader) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value)
          const lines = chunk.split('\n')
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6)
              if (data === '[DONE]') {
                // Processing complete
                try {
                  const extractedData = JSON.parse(buffer)
                  
                  // Check for duplicate detection
                  if (extractedData.duplicateDetection && extractedData.duplicateDetection.isDuplicate) {
                    console.log('🔍 [DUPLICATE] Duplicate detected for document:', file.name)
                    updateDocumentState({
                      status: 'duplicate_warning',
                      progress: 100,
                      message: 'Potential duplicate detected - user action required',
                      extractedData,
                      duplicateDetection: extractedData.duplicateDetection
                    })
                    
                    // Show duplicate warning dialog
                    setDuplicateWarning({
                      open: true,
                      documentIndex: index,
                      documentData: {
                        file,
                        document,
                        extractedData
                      }
                    })
                  } else {
                    // No duplicates, complete normally
                    updateDocumentState({
                      status: 'completed',
                      progress: 100,
                      message: 'Document processed successfully',
                      extractedData
                    })
                    onDocumentProcessed(extractedData)
                  }
                  return
                } catch (error) {
                  throw new Error('Failed to parse extracted data')
                }
              }
              
              try {
                const parsed = JSON.parse(data)
                buffer += parsed.content
                currentProgress = Math.min(95, currentProgress + 5)
                updateDocumentState({
                  progress: currentProgress,
                  message: 'Analyzing document content...'
                })
              } catch (e) {
                // Skip invalid JSON
              }
            }
          }
        }
      }

      // If we reach here without completing, there might be an issue
      // Let's poll the document status to get the final result
      console.log('🔍 [FALLBACK] Streaming completed without result, polling document status...')
      await pollDocumentStatus(document.id, index, updateDocumentState)

    } catch (error) {
      console.error('Document processing error:', error)
      
      // Enhanced error classification - be more lenient with network/temporary errors
      const errorMessage = error instanceof Error ? error.message : 'An error occurred during processing'
      
      const isNetworkError = errorMessage.includes('fetch') || 
                            errorMessage.includes('network') || 
                            errorMessage.includes('connection') ||
                            errorMessage.includes('NetworkError') ||
                            errorMessage.includes('Failed to upload document')
      
      const isProcessingTimeout = errorMessage.includes('timeout') || 
                                 errorMessage.includes('Failed to process document') ||
                                 errorMessage.includes('AbortError')
      
      const isTemporaryError = errorMessage.includes('502') || 
                              errorMessage.includes('503') || 
                              errorMessage.includes('504') ||
                              errorMessage.includes('Server temporarily unavailable')
      
      const isStreamingError = errorMessage.includes('Failed to parse extracted data') ||
                              errorMessage.includes('Streaming completed without result')
      
      // For all non-fatal errors, attempt to verify document status rather than immediately failing
      if (isNetworkError || isProcessingTimeout || isTemporaryError || isStreamingError) {
        console.log('🔍 [ERROR RECOVERY] Network/timeout/streaming issue detected, attempting to verify document status...', {
          isNetworkError,
          isProcessingTimeout,
          isTemporaryError, 
          isStreamingError,
          errorMessage
        })
        
        // Try to check if the document was actually uploaded/processed successfully
        const currentDoc = state.processedDocuments[index]?.document
        if (currentDoc && currentDoc.id) {
          updateDocumentState({
            status: 'processing',
            progress: 70,
            message: 'Connection issue detected - verifying processing status...'
          })
          await pollDocumentStatus(currentDoc.id, index, updateDocumentState)
        } else {
          // No document ID means upload likely failed
          updateDocumentState({
            status: 'error',
            progress: 0,
            message: 'Upload failed due to connection issues. Please check your internet connection and try again.'
          })
        }
      } else {
        // This appears to be an actual processing error (e.g., invalid document format, etc.)
        console.log('🚨 [ACTUAL ERROR] Genuine processing error detected:', errorMessage)
        updateDocumentState({
          status: 'error',
          progress: 0,
          message: errorMessage.includes('Processing failed') ? 
            'Document processing failed. Please verify the document is a valid tax document (W-2, 1099, etc.) and try again.' : 
            `Processing error: ${errorMessage}`
        })
      }
    }
  }

  // Fallback polling function to get final document status
  const pollDocumentStatus = async (documentId: string, index: number, updateDocumentState: (updates: Partial<ProcessedDocument>) => void) => {
    const maxAttempts = 240 // 8 minutes max - significantly extended for complex Azure DI processing
    let attempts = 0
    let consecutiveErrors = 0
    const maxConsecutiveErrors = 12 // Allow more consecutive errors before giving up
    
    const poll = async () => {
      try {
        console.log(`🔍 [FALLBACK POLL] Checking document status for ${documentId} (attempt ${attempts + 1}/${maxAttempts})`)
        const response = await fetch(`/api/documents/${documentId}`)
        
        if (response.ok) {
          const document = await response.json()
          consecutiveErrors = 0 // Reset error counter on successful response
          
          console.log(`📊 [FALLBACK POLL] Document status: ${document.processingStatus}`)
          
          if (document.processingStatus === 'COMPLETED') {
            console.log(`✅ [FALLBACK POLL] Document processing completed successfully`)
            updateDocumentState({
              status: 'completed',
              progress: 100,
              message: 'Document processed successfully',
              extractedData: document.extractedData
            })
            if (document.extractedData) {
              onDocumentProcessed(document.extractedData)
            }
            return true
          } else if (document.processingStatus === 'FAILED') {
            console.log(`❌ [FALLBACK POLL] Document processing failed`)
            updateDocumentState({
              status: 'error',
              progress: 0,
              message: 'Document processing failed - the document may be corrupted or in an unsupported format'
            })
            return true
          } else if (document.processingStatus === 'PROCESSING' && attempts < maxAttempts) {
            // Still processing, continue polling with better progress indication
            console.log(`⏳ [FALLBACK POLL] Still processing, continuing to poll...`)
            
            // More sophisticated progress calculation and messaging
            const progressPercent = Math.min(95, 50 + Math.floor((attempts / maxAttempts) * 45))
            const elapsedMinutes = Math.floor((attempts + 1) * 2 / 60)
            const totalMinutes = Math.floor(maxAttempts * 2 / 60)
            
            let progressMessage = `Analyzing document content with Azure AI... (${elapsedMinutes}/${totalMinutes} minutes)`
            
            // Provide more context based on elapsed time
            if (elapsedMinutes < 2) {
              progressMessage = `Extracting text and analyzing document structure...`
            } else if (elapsedMinutes < 4) {
              progressMessage = `Processing document fields and tax information...`
            } else if (elapsedMinutes < 6) {
              progressMessage = `Performing detailed analysis and validation... (${elapsedMinutes}/${totalMinutes} minutes)`
            } else {
              progressMessage = `Finalizing extraction and data validation... (${elapsedMinutes}/${totalMinutes} minutes)`
            }
            
            updateDocumentState({
              status: 'processing',
              progress: progressPercent,
              message: progressMessage
            })
            attempts++
            setTimeout(poll, 2000) // Poll every 2 seconds
            return false
          } else {
            // Timeout reached - be more helpful in the message
            const totalMinutes = Math.floor((attempts + 1) * 2 / 60)
            console.warn(`⚠️ [FALLBACK POLL] Polling timeout reached after ${attempts + 1} attempts (${totalMinutes} minutes)`)
            updateDocumentState({
              status: 'error',
              progress: 0,
              message: `Document processing is taking longer than expected (${totalMinutes} minutes). This may indicate a complex document or system load. Please refresh the page to check if processing completed, or try again later.`
            })
            return true
          }
        } else {
          console.warn(`⚠️ [FALLBACK POLL] API response error: ${response.status} ${response.statusText}`)
          consecutiveErrors++
          
          // Don't immediately treat this as a fatal error - it might be temporary
          if (response.status >= 500 && response.status < 600) {
            throw new Error(`Server temporarily unavailable (${response.status})`)
          } else if (response.status === 404) {
            // Document might have been deleted or doesn't exist
            updateDocumentState({
              status: 'error',
              progress: 0,
              message: 'Document not found. It may have been deleted or there was an upload issue.'
            })
            return true
          } else {
            throw new Error(`API response error: ${response.status}`)
          }
        }
      } catch (error) {
        console.error(`❌ [FALLBACK POLL] Error during polling (consecutive: ${consecutiveErrors + 1}):`, error)
        consecutiveErrors++
        
        // More lenient error handling - don't give up too quickly on network issues
        if (consecutiveErrors >= maxConsecutiveErrors) {
          console.error(`❌ [FALLBACK POLL] Too many consecutive errors (${consecutiveErrors}), stopping polling`)
          updateDocumentState({
            status: 'error',
            progress: 0,
            message: 'Unable to check processing status due to persistent connection issues. Please check your internet connection and try refreshing the page.'
          })
          return true
        }
        
        if (attempts < maxAttempts) {
          attempts++
          const elapsedMinutes = Math.floor(attempts * 2 / 60)
          updateDocumentState({
            status: 'processing',
            progress: Math.min(95, 50 + Math.floor((attempts / maxAttempts) * 45)),
            message: `Verifying processing status... (${elapsedMinutes} minutes elapsed)`
          })
          // Gradually increase delay on consecutive errors
          const delay = consecutiveErrors > 3 ? 5000 : 3000
          setTimeout(poll, delay)
          return false
        } else {
          console.error(`❌ [FALLBACK POLL] Max attempts reached with ${consecutiveErrors} consecutive errors`)
          updateDocumentState({
            status: 'error',
            progress: 0,
            message: 'Unable to verify processing completion due to connection issues. Please refresh the page to check if your document was processed successfully.'
          })
          return true
        }
      }
    }
    
    await poll()
  }

  const getDocumentTypeLabel = (documentType: string) => {
    const labels: Record<string, string> = {
      'W2': 'W-2 Form',
      'FORM_1099_INT': '1099-INT Form',
      'FORM_1099_DIV': '1099-DIV Form',
      'FORM_1099_MISC': '1099-MISC Form',
      'FORM_1099_NEC': '1099-NEC Form',
      'FORM_1099_R': '1099-R Form',
      'FORM_1099_G': '1099-G Form',
      'FORM_1099_GENERIC': '1099 Form (Auto-Detected)',
      'OTHER_TAX_DOCUMENT': 'Other Tax Document'
    }
    return labels[documentType] || documentType
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Upload className="h-5 w-5" />
            <span>Upload Tax Documents</span>
          </CardTitle>
          <CardDescription>
            Upload multiple W-2, 1099, or other tax documents to automatically extract income and tax information
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FileUpload
            onFileSelect={handleFileSelect}
            onMultipleFileSelect={(files) => {
              files.forEach(file => handleFileSelect(file))
            }}
            onFileRemove={() => handleFileRemove()}
            selectedFile={null}
            disabled={state.status === 'processing'}
            acceptedTypes={['.pdf', '.png', '.jpg', '.jpeg', '.tiff', '.tif']}
            maxSize={10}
            multiple={true}
          />

          {/* Show selected files queue */}
          {state.files.length > 0 && (
            <div className="mt-4 space-y-2">
              <h4 className="text-sm font-medium text-gray-700">Selected Files ({state.files.length}):</h4>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {state.files.map((file, index) => (
                  <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                    <div className="flex items-center space-x-2">
                      <FileText className="h-4 w-4 text-gray-500" />
                      <span className="text-sm">{file.name}</span>
                      <span className="text-xs text-gray-500">
                        ({(file.size / 1024 / 1024).toFixed(2)} MB)
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleFileRemove(index)}
                      disabled={state.status === 'processing'}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {state.files.length > 0 && state.status === 'idle' && (
            <div className="mt-4">
              <Button 
                onClick={processAllDocuments}
                className="w-full"
              >
                <FileText className="mr-2 h-4 w-4" />
                Process {state.files.length} Document{state.files.length > 1 ? 's' : ''}
              </Button>
            </div>
          )}

          {state.status === 'processing' && (
            <div className="mt-4">
              <Alert className="border-blue-200 bg-blue-50">
                <Clock className="h-4 w-4 text-blue-600" />
                <AlertDescription className="text-blue-800">
                  {state.message}
                </AlertDescription>
              </Alert>
            </div>
          )}

          {state.status === 'completed' && (
            <Alert className="mt-4">
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                All documents processed successfully! Review the extracted data below.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Show processing status for each document */}
      {state.processedDocuments.length > 0 && (
        <div className="space-y-4">
          {state.processedDocuments.map((processedDoc, index) => (
            <Card key={index} className={`${
              processedDoc.status === 'completed' ? 'border-green-200 bg-green-50/50' :
              processedDoc.status === 'error' ? 'border-red-200 bg-red-50/50' :
              processedDoc.status === 'duplicate_warning' ? 'border-amber-200 bg-amber-50/50' :
              processedDoc.status === 'processing' || processedDoc.status === 'uploading' ? 'border-blue-200 bg-blue-50/50' :
              'border-gray-200'
            }`}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    {processedDoc.status === 'completed' && <CheckCircle className="h-5 w-5 text-green-600" />}
                    {processedDoc.status === 'error' && <AlertCircle className="h-5 w-5 text-red-600" />}
                    {processedDoc.status === 'duplicate_warning' && <AlertTriangle className="h-5 w-5 text-amber-600" />}
                    {(processedDoc.status === 'processing' || processedDoc.status === 'uploading') && (
                      <Clock className="h-5 w-5 text-blue-600" />
                    )}
                    {processedDoc.status === 'pending' && <Clock className="h-5 w-5 text-gray-500" />}
                    <span className="text-base">{processedDoc.file.name}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    {processedDoc.document && (
                      <Badge variant="secondary" className="bg-green-100 text-green-800">
                        {getDocumentTypeLabel(processedDoc.document.documentType)}
                      </Badge>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveProcessedDocument(index)}
                      disabled={state.status === 'processing'}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </CardTitle>
                <CardDescription>
                  Status: {processedDoc.message}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {(processedDoc.status === 'uploading' || processedDoc.status === 'processing') && (
                  <FileUploadProgress
                    progress={processedDoc.progress}
                    status={processedDoc.status}
                    message={processedDoc.message}
                  />
                )}

                {processedDoc.status === 'error' && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{processedDoc.message}</AlertDescription>
                  </Alert>
                )}

                {processedDoc.status === 'duplicate_warning' && (
                  <Alert className="border-amber-200 bg-amber-50">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <AlertDescription className="text-amber-800">
                      <strong>Potential duplicate detected!</strong> This document appears similar to existing documents. 
                      Please review the duplicate warning dialog to decide how to proceed.
                      {processedDoc.duplicateDetection && (
                        <div className="mt-2 text-sm">
                          Confidence: {Math.round(processedDoc.duplicateDetection.confidence * 100)}% similarity with {processedDoc.duplicateDetection.matchingDocuments.length} document(s)
                        </div>
                      )}
                    </AlertDescription>
                  </Alert>
                )}

                {processedDoc.status === 'completed' && processedDoc.extractedData && (
                  <div className="space-y-4">
                    <Alert className="border-green-200 bg-green-50">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <AlertDescription className="text-green-800">
                        <strong>Extraction completed!</strong> The data will be validated and added to your income section.
                      </AlertDescription>
                    </Alert>
                    
                    <Tabs defaultValue="preview" className="w-full">
                      <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="preview">Extracted Information</TabsTrigger>
                        <TabsTrigger value="raw">Raw Document Text</TabsTrigger>
                      </TabsList>
                      <TabsContent value="preview" className="mt-4">
                        <div className="space-y-4">
                          <div className="bg-white p-4 rounded-lg border">
                            <h4 className="font-medium text-sm text-gray-700 mb-3">Key Information Extracted:</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                              {processedDoc.extractedData?.extractedData?.wages && (
                                <div>
                                  <span className="text-gray-600">Wages:</span>
                                  <span className="font-medium ml-2">${parseFloat(processedDoc.extractedData.extractedData.wages || '0').toLocaleString()}</span>
                                </div>
                              )}
                              {processedDoc.extractedData?.extractedData?.interestIncome && (
                                <div>
                                  <span className="text-gray-600">Interest Income:</span>
                                  <span className="font-medium ml-2">${parseFloat(processedDoc.extractedData.extractedData.interestIncome || '0').toLocaleString()}</span>
                                </div>
                              )}
                              {processedDoc.extractedData?.extractedData?.ordinaryDividends && (
                                <div>
                                  <span className="text-gray-600">Dividends:</span>
                                  <span className="font-medium ml-2">${parseFloat(processedDoc.extractedData.extractedData.ordinaryDividends || '0').toLocaleString()}</span>
                                </div>
                              )}
                              {processedDoc.extractedData?.extractedData?.employerName && (
                                <div>
                                  <span className="text-gray-600">Employer:</span>
                                  <span className="font-medium ml-2">{processedDoc.extractedData.extractedData.employerName}</span>
                                </div>
                              )}
                              {processedDoc.extractedData?.extractedData?.payerName && (
                                <div>
                                  <span className="text-gray-600">Payer:</span>
                                  <span className="font-medium ml-2">{processedDoc.extractedData.extractedData.payerName}</span>
                                </div>
                              )}
                              {(processedDoc.extractedData?.extractedData?.employeeName || processedDoc.extractedData?.extractedData?.recipientName) && (
                                <div>
                                  <span className="text-gray-600">Name on Document:</span>
                                  <span className="font-medium ml-2">{processedDoc.extractedData.extractedData.employeeName || processedDoc.extractedData.extractedData.recipientName}</span>
                                </div>
                              )}
                            </div>
                          </div>
                          
                          <details className="mt-4">
                            <summary className="cursor-pointer text-sm text-gray-600 hover:text-gray-800">
                              View all extracted data (JSON)
                            </summary>
                            <pre className="whitespace-pre-wrap text-xs bg-gray-50 p-4 rounded-lg mt-2 overflow-x-auto">
                              {JSON.stringify(processedDoc.extractedData, null, 2)}
                            </pre>
                          </details>
                        </div>
                      </TabsContent>
                      <TabsContent value="raw" className="mt-4">
                        <div className="space-y-4">
                          <div className="bg-gray-50 p-4 rounded-lg max-h-60 overflow-y-auto">
                            <p className="text-sm font-mono whitespace-pre-wrap">
                              {processedDoc.document?.ocrText || 'No OCR text available'}
                            </p>
                          </div>
                        </div>
                      </TabsContent>
                    </Tabs>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add more documents button */}
      {state.processedDocuments.length > 0 && state.status !== 'processing' && (
        <Card className="border-2 border-dashed border-gray-300 hover:border-blue-400 transition-colors">
          <CardContent className="text-center py-8">
            <Plus className="h-8 w-8 text-gray-400 mx-auto mb-2" />
            <p className="text-gray-600 mb-4">Need to upload more documents?</p>
            <Button 
              variant="outline"
              onClick={() => {
                // Reset to upload mode - keep existing processed documents
                setState(prev => ({ 
                  ...prev, 
                  status: 'idle',
                  message: 'Ready to upload more documents',
                  // Don't clear processedDocuments to maintain document history
                  files: [], // Clear only the pending files
                  currentlyProcessing: null,
                  progress: 0
                }))
                
                // Notify parent component to reset its state
                if (onUploadMoreRequested) {
                  onUploadMoreRequested()
                }
              }}
            >
              <Upload className="h-4 w-4 mr-2" />
              Upload More Documents
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Duplicate Warning Dialog */}
      <DuplicateWarningDialog
        open={duplicateWarning.open}
        onOpenChange={(open) => {
          if (!open) {
            setDuplicateWarning({
              open: false,
              documentIndex: null,
              documentData: null
            })
          }
        }}
        documentFileName={duplicateWarning.documentData?.file.name || ''}
        duplicateDetection={duplicateWarning.documentData?.extractedData?.duplicateDetection || {
          isDuplicate: false,
          confidence: 0,
          matchingDocuments: [],
          matchCriteria: {
            documentType: false,
            employerInfo: false,
            recipientInfo: false,
            amountSimilarity: false,
            nameSimilarity: false
          }
        }}
        onAction={handleDuplicateAction}
      />
    </div>
  )
}
