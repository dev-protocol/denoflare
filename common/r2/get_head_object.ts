import { AwsCallContext, computeBucketUrl, s3Fetch, throwIfUnexpectedStatus, UrlStyle } from './r2.ts';

export type GetObjectOpts = { bucket: string, key: string, origin: string, region: string, urlStyle?: UrlStyle, ifMatch?: string, ifNoneMatch?: string, ifModifiedSince?: string, ifUnmodifiedSince?: string, partNumber?: number, range?: string };

export async function getObject(opts: GetObjectOpts, context: AwsCallContext): Promise<Response | undefined> {
    return await getOrHeadObject('GET', opts, context);
}

export type HeadObjectOpts = GetObjectOpts;

export async function headObject(opts: HeadObjectOpts, context: AwsCallContext): Promise<Response | undefined> {
    return await getOrHeadObject('HEAD', opts, context);
}

//

async function getOrHeadObject(method: 'GET' | 'HEAD', opts: GetObjectOpts | HeadObjectOpts, context: AwsCallContext): Promise<Response | undefined> {
    const { bucket, key, origin, region, urlStyle, ifMatch, ifNoneMatch, ifModifiedSince, ifUnmodifiedSince, partNumber, range } = opts;
    const url = computeBucketUrl({ origin, bucket, key, urlStyle });
    const headers = new Headers();
    if (typeof ifMatch === 'string') headers.set('if-match', ifMatch);
    if (typeof ifNoneMatch === 'string') headers.set('if-none-match', ifNoneMatch);
    if (typeof ifModifiedSince === 'string') headers.set('if-modified-since', ifModifiedSince);
    if (typeof ifUnmodifiedSince === 'string') headers.set('if-unmodified-since', ifUnmodifiedSince);
    if (typeof range === 'string') headers.set('range', range);
    if (typeof partNumber === 'number') url.searchParams.set('partNumber', String(partNumber));

    const res = await s3Fetch({ method, url, headers, region, context });
    if (res.status === 404) return undefined;
    await throwIfUnexpectedStatus(res, 200, 304, 206);
    return res;
}
