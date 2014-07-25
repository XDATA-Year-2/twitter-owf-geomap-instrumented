import pymongo
import bson.json_util

def run(host, db, collection, box="null", users="[]", limit="1000"):
    limit = int(limit)
    box = bson.json_util.loads(box)
    users = bson.json_util.loads(users)
    c = pymongo.MongoClient(host)[db][collection]

    query = {'mentioned': True}
    if box:
        query['location'] = {'$geoWithin': {'$box': box}}
    if len(users) > 0:
        query['user'] = {'$in': users}

    iterator = c.find(query, sort=[('randomNumber', pymongo.ASCENDING)], limit=limit)

    if len(users) > 0:
        iterator.hint([('user', pymongo.ASCENDING)])
    elif not box or (box[1][0] - box[0][0])*(box[1][1]-box[0][1]) > 0.1:
        # Threshold is when we hit 50,000 tweets in the bounding box,
        # When it's larger than this, it's best to use the randomNumber index.
        iterator.hint([('randomNumber', pymongo.ASCENDING)])

    return bson.json_util.dumps({'result': {'data': [d for d in iterator]}})

