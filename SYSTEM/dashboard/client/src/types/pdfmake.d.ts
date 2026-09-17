declare module 'pdfmake/build/pdfmake' {
  const pdfMake: {
    addVirtualFileSystem(fonts: Record<string, string>): void
    setUrlAccessPolicy(policy: (url: string) => boolean): void
    createPdf(definition: Record<string, unknown>): { getBlob(): Promise<Blob> }
  }
  export default pdfMake
}
declare module 'pdfmake/build/vfs_fonts' {
  const fonts: Record<string, string>
  export default fonts
}
