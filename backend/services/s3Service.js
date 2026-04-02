const { S3Client, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const getAwsConfig = () => {
    const region = process.env.AWS_REGION || process.env.REACT_APP_AWS_REGION;
    const bucket = process.env.AWS_BUCKET || process.env.REACT_APP_S3_BUCKET_NAME;
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID || process.env.REACT_APP_AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || process.env.REACT_APP_AWS_SECRET_ACCESS_KEY;

    return { region, bucket, accessKeyId, secretAccessKey };
};

let s3ClientInstance = null;
const getS3Client = () => {
    if (s3ClientInstance) return s3ClientInstance;
    
    const config = getAwsConfig();
    if (!config.region || !config.bucket || !config.accessKeyId || !config.secretAccessKey) {
        throw new Error('S3 configuration is missing.');
    }
    s3ClientInstance = new S3Client({
        region: config.region,
        credentials: {
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey,
        },
        requestChecksumCalculation: "WHEN_REQUIRED",
        responseChecksumValidation: "WHEN_REQUIRED",
    });
    return s3ClientInstance;
};

const checkFileExists = async (key) => {
    const s3 = getS3Client();
    const bucket = getAwsConfig().bucket;
    try {
        await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return true;
    } catch (err) {
        const notFound =
            err?.name === 'NotFound' ||
            err?.$metadata?.httpStatusCode === 404 ||
            err?.Code === 'NotFound' ||
            err?.name === 'Forbidden' ||
            err?.name === 'AccessDenied' ||
            err?.$metadata?.httpStatusCode === 403;

        if (notFound) {
            return false;
        }
        throw err;
    }
};

const getPresignedUrl = async (key, expiresIn = 3600) => {
    const s3 = getS3Client();
    const bucket = getAwsConfig().bucket;
    // Do NOT force ResponseContentType — it overrides S3's stored content-type
    // and causes browsers (especially Firefox) to reject the file as corrupt.
    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    return await getSignedUrl(s3, command, { expiresIn });
};

const listAllObjects = async () => {
    const s3 = getS3Client();
    const bucket = getAwsConfig().bucket;
    let isTruncated = true;
    let continuationToken = null;
    const items = [];

    while (isTruncated) {
        const cmd = new ListObjectsV2Command({
            Bucket: bucket,
            ContinuationToken: continuationToken,
        });
        const res = await s3.send(cmd);
        if (res.Contents) {
            items.push(...res.Contents.map(c => c.Key));
        }
        isTruncated = res.IsTruncated;
        continuationToken = res.NextContinuationToken;
    }
    return items;
};

module.exports = {
    getAwsConfig,
    checkFileExists,
    getPresignedUrl,
    listAllObjects
};
