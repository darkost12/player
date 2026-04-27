;(() => {
  window.APP_CONFIG = {
    FORCE_PATH_STYLE: true,
    BUCKET: 'darkost-public', // Bucket name,
    ENDPOINT: 'storage.yandexcloud.net/', // Don't include protocol
    SUBPATH: 'music/', // Path inside your S3
    METADATA: 'metadata/', // Path inside your S3 for .yml metadata files
    ACCESS_KEY: '', // Access key if bucket is private (optional)
    SECRET_KEY: '', // Secret key if bucket is private (optional). Don't distribute with real secret key!
  }
})()
