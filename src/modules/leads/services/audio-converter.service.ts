import { Injectable } from '@nestjs/common'
import { spawn } from 'child_process'
import ffmpegStatic from 'ffmpeg-static'

export type ConvertedAudio = {
  buffer: Buffer
  mimeType: string
  extension: string
}

@Injectable()
export class AudioConverterService {

  async convertWebmToOgg(inputBuffer: Buffer, originalFileName: string): Promise<ConvertedAudio> {
    return new Promise((resolve, reject) => {
      const ffmpegPath = (ffmpegStatic || '') as string
      
      if (!ffmpegPath) {
        reject(new Error('FFmpeg binary not found'))
        return
      }
      
      const ffmpegProcess = spawn(ffmpegPath, [
        '-i', 'pipe:0',           // Read from stdin
        '-c:a', 'libmp3lame',     // Audio codec (MP3)
        '-q:a', '5',              // Quality (2=highest, 9=lowest, 5=good balance)
        '-ar', '44100',           // Sample rate (44.1kHz is MP3 standard)
        '-ac', '1',               // Audio channels (mono)
        '-f', 'mp3',              // Output format
        'pipe:1'                  // Write to stdout
      ])

      const chunks: Buffer[] = []

      ffmpegProcess.stdout.on('data', (chunk: Buffer) => {
        chunks.push(chunk)
      })

      ffmpegProcess.on('error', (error: Error) => {
        reject(new Error(`Audio conversion failed: ${error.message}`))
      })

      ffmpegProcess.on('exit', (code: number) => {
        if (code !== 0) {
          reject(new Error(`FFmpeg conversion failed with exit code ${code}`))
          return
        }

        const convertedBuffer = Buffer.concat(chunks)

        // Validate converted buffer
        if (convertedBuffer.length === 0) {
          reject(new Error('FFmpeg produced no output'))
          return
        }

        resolve({
          buffer: convertedBuffer,
          mimeType: 'audio/mpeg',
          extension: 'mp3'
        })
      })

      // Send input buffer to ffmpeg stdin
      ffmpegProcess.stdin.write(inputBuffer)
      ffmpegProcess.stdin.end()
    })
  }

  isWebmAudio(mimeType: string): boolean {
    const isWebm = mimeType.toLowerCase().includes('webm')
    const isAudioWebm = mimeType.toLowerCase().includes('audio/webm')
    return isWebm || isAudioWebm
  }
}
