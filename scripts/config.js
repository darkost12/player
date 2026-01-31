;(() => {
  window.APP_CONFIG = {
    BUCKET: 'darkost-public', // Bucket name,
    ENDPOINT: 'storage.yandexcloud.net/', // Don't include protocol
    SUBPATH: 'music/', // Path inside your S3
    ACCESS_KEY: '', // Access key if bucket is private (optional)
    SECRET_KEY: '', // Secret key if bucket is private (optional). Don't distribute with real secret key!
  }
})()
