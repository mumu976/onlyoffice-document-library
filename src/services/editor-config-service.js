import jwt from "jsonwebtoken";

const documentTypeByExtension = {
  docx: "word",
  xlsx: "cell",
};

export class EditorConfigService {
  constructor({ appInternalUrl, jwtSecret }) {
    this.appInternalUrl = appInternalUrl;
    this.jwtSecret = jwtSecret;
  }

  build(metadata) {
    const unsignedConfig = {
      type: "desktop",
      width: "100%",
      height: "100%",
      documentType: documentTypeByExtension[metadata.extension],
      document: {
        fileType: metadata.extension,
        key: `${metadata.id}-${metadata.revision}`,
        title: metadata.name,
        url: `${this.appInternalUrl}/api/files/${metadata.id}/content`,
        permissions: {
          edit: true,
          download: true,
          print: true,
        },
      },
      editorConfig: {
        callbackUrl: `${this.appInternalUrl}/api/onlyoffice/callback/${metadata.id}`,
        lang: "zh-CN",
        mode: "edit",
        user: {
          id: "demo-user",
          name: "演示用户",
        },
        customization: {
          forcesave: true,
        },
      },
    };

    return {
      ...unsignedConfig,
      token: jwt.sign(unsignedConfig, this.jwtSecret, { algorithm: "HS256" }),
    };
  }
}
