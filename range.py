import pymongo
import bson.json_util

def run(host, db, collection, field):
    c = pymongo.MongoClient(host)[db][collection]
    return bson.json_util.dumps({
        'result': [
            c.find_one(sort=[(field, pymongo.ASCENDING)])[field],
            c.find_one(sort=[(field, pymongo.DESCENDING)])[field]
        ]
    })

