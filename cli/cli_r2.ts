import { CLI_VERSION } from './cli_version.ts';
import { listObjects, LIST_OBJECTS_COMMAND } from './cli_r2_list_objects.ts';
import { listObjectsV1, LIST_OBJECTS_V1_COMMAND } from './cli_r2_list_objects_v1.ts';
import { getObject, GET_OBJECT_COMMAND, headObject, HEAD_OBJECT_COMMAND } from './cli_r2_get_head_object.ts';
import { commandOptionsForConfig, loadConfig, resolveProfile } from './config_loader.ts';
import { AwsCallBody, AwsCallContext, AwsCredentials, R2, R2_REGION_AUTO } from '../common/r2/r2.ts';
import { Bytes } from '../common/bytes.ts';
import { listBuckets, LIST_BUCKETS_COMMAND } from './cli_r2_list_buckets.ts';
import { headBucket, HEAD_BUCKET_COMMAND } from './cli_r2_head_bucket.ts';
import { getBucketEncryption, GET_BUCKET_ENCRYPTION_COMMAND } from './cli_r2_get_bucket_encryption.ts';
import { deleteBucketEncryption, DELETE_BUCKET_ENCRYPTION_COMMAND } from './cli_r2_delete_bucket_encryption.ts';
import { putBucketEncryption, PUT_BUCKET_ENCRYPTION_COMMAND } from './cli_r2_put_bucket_encryption.ts';
import { createBucket, CREATE_BUCKET_COMMAND } from './cli_r2_create_bucket.ts';
import { deleteBucket, DELETE_BUCKET_COMMAND } from './cli_r2_delete_bucket.ts';
import { generic } from './cli_r2_generic.ts';
import { putObject, PUT_OBJECT_COMMAND } from './cli_r2_put_object.ts';
import { deleteObject, DELETE_OBJECT_COMMAND } from './cli_r2_delete_object.ts';
import { deleteObjects, DELETE_OBJECTS_COMMAND } from './cli_r2_delete_objects.ts';
import { copyObject, COPY_OBJECT_COMMAND } from './cli_r2_copy_object.ts';
import { createMultipartUpload } from './cli_r2_create_multipart_upload.ts';
import { abortMultipartUpload } from './cli_r2_abort_multipart_upload.ts';
import { completeMultipartUpload } from './cli_r2_complete_multipart_upload.ts';
import { uploadPart } from './cli_r2_upload_part.ts';
import { uploadPartCopy } from './cli_r2_upload_part_copy.ts';
import { putLargeObject } from './cli_r2_put_large_object.ts';
import { CLI_USER_AGENT, denoflareCliCommand, parseOptionalBooleanOption, parseOptionalStringOption } from './cli_common.ts';
import { computeMd5, computeStreamingMd5, computeStreamingSha256 } from './wasm_crypto.ts';
import { checkMatchesReturnMatcher } from '../common/check.ts';
import { ApiR2Bucket } from './api_r2_bucket.ts';
import { verifyToken } from '../common/cloudflare_api.ts';
import { CliCommand } from './cli_command.ts';

const cmd = denoflareCliCommand('r2', 'Manage R2 storage using the S3 compatibility API')
    .subcommand(LIST_BUCKETS_COMMAND, listBuckets)
    .subcommand(HEAD_BUCKET_COMMAND, headBucket)
    .subcommand(CREATE_BUCKET_COMMAND, createBucket)
    .subcommand(DELETE_BUCKET_COMMAND, deleteBucket)
    .subcommand(GET_BUCKET_ENCRYPTION_COMMAND, getBucketEncryption)
    .subcommand(DELETE_BUCKET_ENCRYPTION_COMMAND, deleteBucketEncryption)
    .subcommand(PUT_BUCKET_ENCRYPTION_COMMAND, putBucketEncryption)

    .subcommand(LIST_OBJECTS_COMMAND, listObjects)
    .subcommand(LIST_OBJECTS_V1_COMMAND, listObjectsV1)
    .subcommand(GET_OBJECT_COMMAND, getObject)
    .subcommand(HEAD_OBJECT_COMMAND, headObject)
    .subcommand(PUT_OBJECT_COMMAND, putObject)
    .subcommand(DELETE_OBJECT_COMMAND, deleteObject)
    .subcommand(DELETE_OBJECTS_COMMAND, deleteObjects)
    .subcommand(COPY_OBJECT_COMMAND, copyObject)
    ;

export async function r2(args: (string | number)[], options: Record<string, unknown>): Promise<void> {
    if (1 === 1) {
        await cmd.routeSubcommand(args, options);
        return;
    }
    const subcommand = args[0];
    if (options.help && args.length === 0 || typeof subcommand !== 'string') {
        dumpHelp();
        return;
    }

    const fn = { 
        'list-buckets': listBuckets, 
        'head-bucket': headBucket,
        'create-bucket': createBucket, 
        'delete-bucket': deleteBucket, 
        'get-bucket-encryption': getBucketEncryption, 
        'delete-bucket-encryption': deleteBucketEncryption, 
        'put-bucket-encryption': putBucketEncryption, 

        'list-objects': listObjects, 
        'list-objects-v1': listObjectsV1,
        'get-object': getObject, 
        'head-object': headObject,
        'put-object': putObject,
        'delete-object': deleteObject,
        'delete-objects': deleteObjects,
        'copy-object': copyObject,

        'create-multipart-upload': createMultipartUpload,
        'abort-multipart-upload': abortMultipartUpload,
        'complete-multipart-upload': completeMultipartUpload,
        'upload-part': uploadPart,
        'upload-part-copy': uploadPartCopy,

        generic,
        'put-large-object': putLargeObject,
        tmp,

     }[subcommand];
    if (fn) {
        await fn(args.slice(1), options);
    } else {
        dumpHelp();
    }
}

export function commandOptionsForR2(command: CliCommand<unknown>) {
    return command
        .optionGroup()
        .option('unsignedPayload', 'boolean', 'If set, skip request body signing (and thus verification) for the R2 request')
        .include(commandOptionsForConfig)
        ;
}

export async function loadR2Options(options: Record<string, unknown>): Promise<{ origin: string, region: string, context: AwsCallContext }> {
    const config = await loadConfig(options);
    const { accountId, apiToken } = await resolveProfile(config, options);
    const apiTokenId = (await verifyToken(apiToken)).id;

    const credentials: AwsCredentials = {
        accessKey: apiTokenId,
        secretKey: (await Bytes.ofUtf8(apiToken).sha256()).hex(),
    };
    const origin = `https://${accountId}.r2.cloudflarestorage.com`;
    const region = R2_REGION_AUTO;
    const unsignedPayload = parseOptionalBooleanOption('unsigned-payload', options);
    const context = { credentials, userAgent: CLI_USER_AGENT, unsignedPayload };

    return { origin, region, context };
}

export function surroundWithDoubleQuotesIfNecessary(value: string | undefined): string | undefined {
    if (value === undefined) return value;
    if (!value.startsWith('"')) value = '"' + value;
    if (!value.endsWith('"')) value += '"';
    return value;
}

export function commandOptionsForLoadBodyFromOptions(command: CliCommand<unknown>) {
    return command
        .optionGroup()
        .option('contentMd5', 'string', 'Precomputed Content-MD5 of the contents', { hint: 'base64' })
        .option('computeContentMd5', 'boolean', 'If set, automatically compute Content-MD5 of the contents')
        .option('file', 'string', 'Path to the contents', { hint: 'path' })
        .option('filestream', 'string', 'Path to the contents (streaming upload)', { hint: 'path' })
        .option('bytes', 'string', 'Range of local file to upload (e.g. bytes=0-100)')
        ;
}

export async function loadBodyFromOptions(options: Record<string, unknown>, unsignedPayload: boolean | undefined): Promise<{ body: AwsCallBody, contentMd5?: string }> {
    let contentMd5 = parseOptionalStringOption('content-md5', options);
    const shouldComputeContentMd5 = parseOptionalBooleanOption('compute-content-md5', options);

    const start = Date.now();
    let prepMillis = 0;
    const computeBody: () => Promise<AwsCallBody> = async () => {
        const { file, filestream } = options;
        try {
            if (typeof file === 'string') {
                const bytes = parseOptionalStringOption('bytes', options);
                let startByte: number | undefined;
                let endByte: number | undefined;
                if (typeof bytes === 'string') {
                    const m = checkMatchesReturnMatcher('bytes', bytes, /^(\d+)-(\d*)$/);
                    if (!m) throw new Error(`Bad bytes: ${bytes}`);
                    startByte = parseInt(m[1]);
                    if (m[2] !== '') endByte = parseInt(m[2]);
                    if (typeof endByte === 'number' && startByte > endByte) throw new Error(`Bad bytes: ${bytes}`);
                }
                let rt = new Bytes(await Deno.readFile(file));
                if (typeof startByte === 'number') {
                    rt = new Bytes(rt.array().slice(startByte, typeof endByte === 'number' ? (endByte + 1) : undefined));
                    console.log(rt.length);
                }
                return rt;
            }
            if (typeof filestream === 'string') {
                
                const stat = await Deno.stat(filestream);
                if (!stat.isFile) throw new Error(`--file must point to a file`);
                const length = stat.size;

                const f1 = await Deno.open(filestream);
                const sha256Hex = unsignedPayload ? 'UNSIGNED-PAYLOAD' : (await computeStreamingSha256(f1.readable)).hex();

                let md5Base64: string | undefined;
                if (shouldComputeContentMd5) {
                    const f2 = await Deno.open(filestream);
                    md5Base64 = (await computeStreamingMd5(f2.readable)).base64();
                }

                const f3 = await Deno.open(filestream);
                return { stream: f3.readable, sha256Hex, length, md5Base64 };
            }
            throw new Error(`Must provide the --file or --filestream option`);
        } finally {
            prepMillis = Date.now() - start;
        }
    };

    const body = await computeBody();
    
    if (shouldComputeContentMd5) {
        if (contentMd5) throw new Error(`Cannot compute content-md5 if it's already provided`);
        const start = Date.now();
        if (typeof body === 'string' || body instanceof Bytes) {
            contentMd5 = (await computeMd5(body)).base64();
        } else {
            if (!body.md5Base64) throw new Error(`Cannot compute content-md5 if the stream source does not provide it`);
            contentMd5 = body.md5Base64;
        }
        prepMillis += Date.now() - start;
    }
    console.log(`prep took ${prepMillis}ms`);
    return { body, contentMd5 };
}

//

async function tmp(args: (string | number)[], options: Record<string, unknown>) {
    const [ bucketName, key ] = args;
    if (typeof bucketName !== 'string') throw new Error();
    if (typeof key !== 'string') throw new Error();

    const verbose = !!options.verbose;
    if (verbose) {
        R2.DEBUG = true;
    }
    
    const config = await loadConfig(options);
    const profile = await resolveProfile(config, options);
    const bucket = await ApiR2Bucket.ofProfile(profile, bucketName, CLI_USER_AGENT);
    const { body } = await fetch('https://yahoo.com');
    const res = await bucket.put(key, body);
    console.log(res);
    // if (res) console.log(await res.text());
}

function dumpHelp() {
    const lines = [
        `denoflare-r2 ${CLI_VERSION}`,
        'Manage R2 storage using the S3 compatibility API',
        '',
        'USAGE:',
        '    denoflare r2 [subcommand] [FLAGS] [OPTIONS] [args]',
        '',
        'SUBCOMMANDS:',
        '    list-objects    List objects within a bucket',
        '    get-object      Get R2 object for a given key',
        '',
        'For subcommand-specific help: denoflare r2 [subcommand] --help',
    ];
    for (const line of lines) {
        console.log(line);
    }
}

